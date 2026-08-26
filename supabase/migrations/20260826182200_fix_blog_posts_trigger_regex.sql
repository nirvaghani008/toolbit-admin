-- Migration: Fix regex in handle_blog_posts_before_write trigger function
-- Description: Fixes POSIX regular expression brackets/parentheses escaping when stripping Markdown links and images.

CREATE OR REPLACE FUNCTION public.handle_blog_posts_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    -- Embedding & Similarity variables
    v_title                text;
    v_desc                 text;
    
    parts                  text[] := '{}';
    text_str               text;
    embedding_text         text;
    last_space             integer;
    
    worker_url             text;
    worker_auth_secret     text;
    
    http_response          extensions.http_response;
    embedding_response     jsonb;
    
    v_max_sim              double precision := 0.0;
    v_match_id             integer := NULL;
    v_match_title          text := NULL;
    v_title_sim            double precision := 0.0;
    is_duplicate           boolean := false;

    -- Reading time variables
    plain_text             text;
    word_count             integer;
BEGIN
    -- Sync updated_at timestamp ONLY when content/metadata changes or on INSERT
    IF TG_OP = 'INSERT' THEN
        IF NEW.updated_at IS NULL THEN
            NEW.updated_at := NOW();
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF (
            OLD.title IS DISTINCT FROM NEW.title OR
            OLD.description IS DISTINCT FROM NEW.description OR
            OLD.content_mdx IS DISTINCT FROM NEW.content_mdx OR
            OLD.status IS DISTINCT FROM NEW.status OR
            OLD.categories IS DISTINCT FROM NEW.categories OR
            OLD.tags IS DISTINCT FROM NEW.tags OR
            OLD.meta_title IS DISTINCT FROM NEW.meta_title OR
            OLD.meta_description IS DISTINCT FROM NEW.meta_description OR
            OLD.featured_image_url IS DISTINCT FROM NEW.featured_image_url OR
            OLD.submission_tier IS DISTINCT FROM NEW.submission_tier OR
            OLD.is_paid IS DISTINCT FROM NEW.is_paid
        ) THEN
            NEW.updated_at := NOW();
        ELSIF OLD.updated_at IS DISTINCT FROM NEW.updated_at THEN
            NEW.updated_at := NEW.updated_at;
        ELSE
            NEW.updated_at := OLD.updated_at;
        END IF;
    END IF;

    -- Automatically handle team posts vs guest post submission tiers & defaults
    IF NEW.author_name = 'Toolbit AI - Team'
       OR (NEW.author_id IS NULL AND (NEW.author_name IS NULL OR pg_catalog.btrim(NEW.author_name) = '')) THEN
        NEW.author_name := 'Toolbit AI - Team';
        NEW.submission_tier := 'free';
        NEW.is_paid := false;
    ELSIF NEW.submission_tier IS NULL THEN
        IF NEW.author_id IS NULL THEN
            NEW.submission_tier := 'free';
            NEW.is_paid := false;
        ELSE
            NEW.submission_tier := 'free_guest_post';
        END IF;
    END IF;

    -- For user submissions (author_id IS NOT NULL), normalize empty string author_name to NULL
    IF NEW.author_id IS NOT NULL AND NEW.author_name IS NOT NULL AND pg_catalog.btrim(NEW.author_name) = '' THEN
        NEW.author_name := NULL;
    END IF;

    -- Calculate reading_time_minutes and extract plain_text preview if content_mdx is provided
    IF NEW.content_mdx IS NOT NULL AND pg_catalog.btrim(NEW.content_mdx) <> '' THEN
        plain_text := NEW.content_mdx;
        plain_text := pg_catalog.regexp_replace(plain_text, '```.*?```', ' ', 'g');
        plain_text := pg_catalog.regexp_replace(plain_text, '`[^`]*`', ' ', 'g');
        plain_text := pg_catalog.regexp_replace(plain_text, '!\[[^]]*\]\([^)]*\)', ' ', 'g');
        plain_text := pg_catalog.regexp_replace(plain_text, '\[([^]]*)\]\([^)]*\)', '\1', 'g');
        plain_text := pg_catalog.regexp_replace(plain_text, '<[^>]+>', ' ', 'g');
        plain_text := pg_catalog.regexp_replace(plain_text, '[#*_>|~`]', ' ', 'g');
        plain_text := pg_catalog.btrim(pg_catalog.regexp_replace(plain_text, '\s+', ' ', 'g'));

        IF plain_text <> '' THEN
            word_count := pg_catalog.array_length(pg_catalog.regexp_split_to_array(plain_text, ' '), 1);
            NEW.reading_time_minutes := greatest(1, pg_catalog.round(word_count::numeric / 200));
        END IF;
    END IF;

    -- Check if embedding calculation is needed
    IF TG_OP = 'INSERT' 
       OR NEW.topic_embedding_256 IS NULL 
       OR OLD.title IS DISTINCT FROM NEW.title 
       OR OLD.description IS DISTINCT FROM NEW.description 
       OR OLD.meta_description IS DISTINCT FROM NEW.meta_description THEN

        -- Dynamically retrieve configuration from supabase_functions.secrets
        IF to_regclass('supabase_functions.secrets') IS NOT NULL THEN
            SELECT
                MAX(secret) FILTER (WHERE name = 'embedding_worker_url'),
                MAX(secret) FILTER (WHERE name = 'worker_secret')
            INTO worker_url, worker_auth_secret
            FROM supabase_functions.secrets
            WHERE name IN ('embedding_worker_url', 'worker_secret');
        END IF;

        IF NULLIF(btrim(worker_url), '') IS NULL THEN
            worker_url := current_setting('app.settings.embedding_worker_url', true);
        END IF;

        IF NULLIF(btrim(worker_url), '') IS NULL THEN
            worker_url := 'https://text-embedder.tbit.workers.dev';
        END IF;

        IF NULLIF(btrim(worker_auth_secret), '') IS NULL THEN
            worker_auth_secret := current_setting('app.settings.worker_secret', true);
        END IF;

        IF NULLIF(btrim(worker_auth_secret), '') IS NULL THEN
            worker_auth_secret := 'toolbit-get-tool-info-secret-2026';
        END IF;

        -- Build deterministic text representation
        v_title := COALESCE(trim(NEW.title), '');
        v_desc  := COALESCE(NULLIF(trim(NEW.description), ''), NULLIF(trim(NEW.meta_description), ''), '');

        IF v_title <> '' THEN
            parts := array_append(parts, 'title: ' || v_title);
        END IF;
        IF v_desc <> '' THEN
            parts := array_append(parts, 'description: ' || v_desc);
        END IF;
        IF plain_text IS NOT NULL AND plain_text <> '' THEN
            parts := array_append(parts, 'content: ' || substring(plain_text from 1 for 400));
        END IF;

        text_str := array_to_string(parts, ' | ');
        IF length(text_str) > 1000 THEN
            text_str := substring(text_str from 1 for 1000);
            last_space := length(text_str) - position(' ' in reverse(text_str)) + 1;
            IF last_space > 700 THEN
                text_str := substring(text_str from 1 for last_space - 1);
            END IF;
        END IF;

        embedding_text := text_str;

        IF embedding_text <> '' THEN
            BEGIN
                http_response := extensions.http((\
                    'POST',\
                    worker_url,\
                    ARRAY[\
                        extensions.http_header('Content-Type', 'application/json'),\
                        extensions.http_header('Authorization', 'Bearer ' || worker_auth_secret)\
                    ],\
                    'application/json',\
                    jsonb_build_object(\
                        'text', embedding_text,\
                        'type', 'document',\
                        'dimensions', 256\
                    )::text\
                ));

                IF http_response.status = 200 THEN
                    embedding_response := http_response.content::jsonb;
                    IF embedding_response->>'success' = 'true' AND embedding_response->>'pgvector' IS NOT NULL THEN
                        NEW.topic_embedding_256 := (embedding_response->>'pgvector')::extensions.vector;
                    ELSIF embedding_response->'embedding' IS NOT NULL THEN
                        NEW.topic_embedding_256 := (embedding_response->'embedding')::text::extensions.vector;
                    END IF;
                ELSE
                    RAISE WARNING 'text-embedder worker returned HTTP % for blog post %', http_response.status, NEW.title;
                END IF;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Failed to generate embedding via worker for blog post %: %', NEW.title, SQLERRM;
            END;
        END IF;
    END IF;

    -- Duplicate Topic Check: compare vector against existing published/non-archived posts
    IF NEW.topic_embedding_256 IS NOT NULL THEN
        SELECT 
            b.id,
            b.title,
            (1 - (b.topic_embedding_256 <=> NEW.topic_embedding_256)) AS similarity
        INTO v_match_id, v_match_title, v_max_sim
        FROM public.blog_posts b
        WHERE b.topic_embedding_256 IS NOT NULL
          AND (TG_OP = 'INSERT' OR b.id <> NEW.id)
          AND b.status <> 'archived'
        ORDER BY (1 - (b.topic_embedding_256 <=> NEW.topic_embedding_256)) DESC
        LIMIT 1;

        IF v_max_sim IS NOT NULL AND v_match_title IS NOT NULL THEN
            v_title_sim := extensions.similarity(LOWER(NEW.title), LOWER(v_match_title));

            IF v_max_sim >= 0.95 THEN
                is_duplicate := true;
            ELSIF v_max_sim >= 0.90 AND (
                v_title_sim >= 0.60 
                OR LOWER(REGEXP_REPLACE(NEW.title, '[^a-zA-Z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE(v_match_title, '[^a-zA-Z0-9]', '', 'g'))
            ) THEN
                is_duplicate := true;
            ELSIF v_max_sim >= 0.88 AND (
                v_title_sim >= 0.85 
                OR LOWER(REGEXP_REPLACE(NEW.title, '[^a-zA-Z0-9]', '', 'g')) = LOWER(REGEXP_REPLACE(v_match_title, '[^a-zA-Z0-9]', '', 'g'))
            ) THEN
                is_duplicate := true;
            END IF;

            IF is_duplicate THEN
                NEW.status := 'archived';
                NEW.ai_approved := false;
                NEW.ai_denied_reason := 'Topic similarity high (' || round((v_max_sim * 100)::numeric, 1) || '% match with post #' || v_match_id || ' "' || left(v_match_title, 40) || '"): automatically archived as duplicate';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
