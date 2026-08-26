-- Migration: Fix syntax error in sync_tool_category_tag_counts
-- Description: Adds missing SET keyword to UPDATE statements on public.categories and public.tags in trigger function.

CREATE OR REPLACE FUNCTION public.sync_tool_category_tag_counts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    old_cats       jsonb;
    new_cats       jsonb;
    old_tags       jsonb;
    new_tags       jsonb;
    old_is_show    boolean;
    new_is_show    boolean;
    target_cats    text[];
    target_tags    text[];
BEGIN
    old_is_show := (TG_OP = 'UPDATE' AND OLD.status = 'show');
    new_is_show := (TG_OP <> 'DELETE' AND NEW.status = 'show');

    IF TG_OP = 'DELETE' THEN
        old_cats := CASE WHEN jsonb_typeof(OLD.tool_info->'categories') = 'array' THEN OLD.tool_info->'categories' ELSE '[]'::jsonb END;
        old_tags := CASE WHEN jsonb_typeof(OLD.tool_info->'tags') = 'array' THEN OLD.tool_info->'tags' ELSE '[]'::jsonb END;
        new_cats := '[]'::jsonb;
        new_tags := '[]'::jsonb;
    ELSIF TG_OP = 'INSERT' THEN
        old_cats := '[]'::jsonb;
        old_tags := '[]'::jsonb;
        new_cats := CASE WHEN jsonb_typeof(NEW.tool_info->'categories') = 'array' THEN NEW.tool_info->'categories' ELSE '[]'::jsonb END;
        new_tags := CASE WHEN jsonb_typeof(NEW.tool_info->'tags') = 'array' THEN NEW.tool_info->'tags' ELSE '[]'::jsonb END;
    ELSE
        old_cats := CASE WHEN jsonb_typeof(OLD.tool_info->'categories') = 'array' THEN OLD.tool_info->'categories' ELSE '[]'::jsonb END;
        new_cats := CASE WHEN jsonb_typeof(NEW.tool_info->'categories') = 'array' THEN NEW.tool_info->'categories' ELSE '[]'::jsonb END;
        old_tags := CASE WHEN jsonb_typeof(OLD.tool_info->'tags') = 'array' THEN OLD.tool_info->'tags' ELSE '[]'::jsonb END;
        new_tags := CASE WHEN jsonb_typeof(NEW.tool_info->'tags') = 'array' THEN NEW.tool_info->'tags' ELSE '[]'::jsonb END;
    END IF;

    -- Collect only the distinct affected categories for fast indexed lookup
    IF (old_cats <> new_cats) OR (old_is_show <> new_is_show) THEN
        SELECT array_agg(DISTINCT lower(v))
        INTO target_cats
        FROM jsonb_array_elements_text(old_cats || new_cats) v
        WHERE v IS NOT NULL AND trim(v) <> '';

        IF target_cats IS NOT NULL AND array_length(target_cats, 1) > 0 THEN
            UPDATE public.categories c
            SET status     = CASE
                               WHEN sub.cnt > 5  THEN 'show'
                               WHEN sub.cnt = 0  THEN 'hide'
                               ELSE c.status
                             END,
                updated_at = NOW()
            FROM (
                SELECT c_item.cat_name,
                       COALESCE((
                         SELECT count(*)::integer
                         FROM public.ai_tools t
                         WHERE t.status = 'show'
                           AND (t.tool_info->'categories') ? c_item.cat_name
                       ), 0) AS cnt
                FROM (
                    SELECT name AS cat_name
                    FROM public.categories
                    WHERE lower(name) = ANY(target_cats)
                ) c_item
            ) sub
            WHERE c.name = sub.cat_name;
        END IF;
    END IF;

    -- Collect only the distinct affected tags for fast indexed lookup
    IF (old_tags <> new_tags) OR (old_is_show <> new_is_show) THEN
        SELECT array_agg(DISTINCT lower(v))
        INTO target_tags
        FROM jsonb_array_elements_text(old_tags || new_tags) v
        WHERE v IS NOT NULL AND trim(v) <> '';

        IF target_tags IS NOT NULL AND array_length(target_tags, 1) > 0 THEN
            UPDATE public.tags tg
            SET status     = CASE
                               WHEN sub.cnt > 5  THEN 'show'
                               WHEN sub.cnt = 0  THEN 'hide'
                               ELSE tg.status
                             END,
                updated_at = NOW()
            FROM (
                SELECT t_item.tag_name,
                       COALESCE((
                         SELECT count(*)::integer
                         FROM public.ai_tools t
                         WHERE t.status = 'show'
                           AND (t.tool_info->'tags') ? t_item.tag_name
                       ), 0) AS cnt
                FROM (
                    SELECT name AS tag_name
                    FROM public.tags
                    WHERE lower(name) = ANY(target_tags)
                ) t_item
            ) sub
            WHERE tg.name = sub.tag_name;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$function$;
