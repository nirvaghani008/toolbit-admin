-- =============================================================================
-- Migration: 20261002160000_flag_matched_tool_submissions.sql
-- Description: Sets metadata->>'is_tool_submission' = 'true' for the 140
--              public.marketing_outreach_leads records matched STRICTLY by business email
--              against pending submissions in ai_tool_submissions (SB2).
--              Matching criteria: sb2.ai_tool_submissions.business_email =
--                                ANY(cloud.marketing_outreach_leads.business_emails)
-- =============================================================================

DO $$
BEGIN
    -- 1. Create a partial index for fast lookups and filtering on tool submissions
    CREATE INDEX IF NOT EXISTS idx_marketing_outreach_leads_is_tool_submission
        ON public.marketing_outreach_leads (((metadata->>'is_tool_submission')))
        WHERE (metadata->>'is_tool_submission' = 'true');

    -- 2. Update the 140 matched marketing outreach leads
    -- Each lead below was matched by its business email against SB2 pending submissions:
    UPDATE public.marketing_outreach_leads
    SET
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{is_tool_submission}',
            '"true"'::jsonb,
            true
        ),
        updated_at = now()
    WHERE id IN (
        '15585ccf-e6e1-4e1e-8b9e-6ea2c9d246c9'::uuid, -- A Deal Sweden AB | Matched Email: kaitlinmgarland@gmail.com
        '2f1a6458-a964-4382-9103-37fee9721947'::uuid, -- Ablaze AI | Matched Email: ablazeaiapp@gmail.com
        'c3b9962a-6a23-4f5a-b1b8-4cf8a5ab9aa2'::uuid, -- AI ASMR | Matched Email: hi@ai-asmr.io
        '2da449f5-b290-4b92-bdd9-abe34983c5b5'::uuid, -- AI Couple Photo | Matched Email: hi@ai-couple-photo.com
        '6d31581e-c3f1-4942-8740-d6b7142376a4'::uuid, -- AI FREE FOREVER | Matched Email: support@aifreeforever.com
        '6d8d3fb6-7133-4901-9abf-7e312fd08497'::uuid, -- AI Graffiti Generator | Matched Email: madcab4real@gmail.com
        'a9fe5e68-adff-46bb-86fb-9beae5431f20'::uuid, -- AI Hexagram | Matched Email: jiangbilly@gmail.com
        'b140fbe4-153b-40d0-9350-ff2816f2809c'::uuid, -- AI Image Generator - Create, Edit & Transform Images | Matched Email: francesstarkenx@gmail.com
        'bd3e7816-cc10-4475-97cb-4462394011ca'::uuid, -- AI Manga Translation | Matched Email: digiplanp@gmail.com
        '1a5a5b56-a632-42d9-8703-8f1699e80e50'::uuid, -- ai music | Matched Email: gpt320@outlook.com
        '242773c9-6267-4ae5-b0fa-f9ac3fd896da'::uuid, -- AI Music Generator | Matched Email: nicohayes@musicgeneratorai.io
        '75bdb9aa-f94d-4e94-8380-7b1dd15c0f67'::uuid, -- AI Music Generator - Create Songs from Text with AI | Matched Email: francesstarkenx@gmail.com
        '95467839-759c-4244-83cd-fed5b2945475'::uuid, -- AI Song Maker : Your AI Music Generator | Automusic | Matched Email: 1301149852@qq.com
        '9423f06c-792a-4ce0-bb5d-d1c60d6661cb'::uuid, -- AI Tarot | Matched Email: jiangbilly@gmail.com
        'a45d9217-8e86-4e2d-ac47-f4afd44b0457'::uuid, -- AI Video Watermark Remover | Matched Email: francesstarkenx@gmail.com
        '1402a74c-aa23-4c8b-a0c3-67b181eca1ed'::uuid, -- AIclicks | Matched Email: rokas@aiclicks.io
        '9cf5df97-8557-4f2b-aab6-264da227cce7'::uuid, -- AISEOMate | Matched Email: oleg@aiseomate.com
        '3717aede-e455-4026-9781-b89476d45152'::uuid, -- AIVeed.io | Matched Email: support@aiveed.io
        'b3b74dac-986e-4b47-8f2b-0831b29f205b'::uuid, -- AnividAI | Matched Email: creamy@anividai.com
        'c283b016-1981-49bc-aa89-b3f698aed982'::uuid, -- Anywhere Remote Jobs | Matched Email: contact@anywhereremotejobs.com
        'fb3ba7c1-fb0a-40ec-a746-8e602fc10c95'::uuid, -- ApparenceKit | Matched Email: hello@apparence.io
        '33d9385c-79c8-432b-944f-e44cbcab215d'::uuid, -- Apprentice | Matched Email: jason@useapprentice.com
        '55c0fb65-66f3-4afa-a327-c70463fb6e09'::uuid, -- Ask Ui | Matched Email: bhavnesh@emptypos.com
        '480197c7-73a8-4a52-8cce-0ea34295cd3e'::uuid, -- Banana Prompts | Matched Email: support@banana-prompts.com
        '35ec9c27-5d67-4746-97e1-49033e703e20'::uuid, -- Banana Prompts | Matched Email: higreatvisai@gmail.com
        '3f7f14ea-6dd3-40d7-a424-da783efd21c8'::uuid, -- Best AI Image to Video | Free, Cheapest Product Promo Maker | Matched Email: ziemannlyndon@gmail.com
        '56845fa1-5d9b-46ba-8321-221027500c27'::uuid, -- Botphonic | Matched Email: social@botphonic.ai
        'fafc1225-8f26-4a69-9884-0e5e13317c25'::uuid, -- Brandscout | Matched Email: erling@brandscout.io
        'c000401a-d6fd-4e31-b3a6-434fbc802edb'::uuid, -- BTWmate | Matched Email: info@sevendigital.nl
        'dc185893-ade8-4378-9f1f-318f5775d62f'::uuid, -- Buzz Cut Filter Online | Matched Email: dreamspire.team@gmail.com
        'd5ecf3a1-574a-4c8e-bdb2-5a8151ce0569'::uuid, -- CardStream | Matched Email: admin@cardstream.pro
        'f76d86e8-25ec-43cc-a148-4013fe00b3b7'::uuid, -- Catalyst Pro app | Matched Email: pieter@millcollective.org
        '92f0b36e-a72a-4384-8163-f06c03bcb83c'::uuid, -- Ceerly | Matched Email: business@ceerly.com
        '54b3e4a4-9903-497e-b2f8-c1e0cfc02f33'::uuid, -- Chargeflow | Matched Email: yuval@chargeflow.io
        'd3e14895-048f-421f-83c8-7df93f7278d5'::uuid, -- Classta | Matched Email: info@classta.co
        '5fcdaa0b-bb32-4f58-82b0-0f2e588da227'::uuid, -- Clutch Click | Matched Email: brady@clutchclick.com
        'dac9d27c-f6b1-466e-94bb-1e94c34d06bf'::uuid, -- Codesync Club | Matched Email: partha@codesync.club
        'c82157c8-ecfe-453f-952a-27dd4440289b'::uuid, -- Content flow AI | Matched Email: contentflowai@mail.io
        'e52e9e9a-666f-4bfe-81a8-ea7849d12838'::uuid, -- Crevas AI | Matched Email: spark@crevas.ai
        'bec8068b-edb2-4556-8c9e-f43996690fd5'::uuid, -- Cursive Reader | Matched Email: chariyalbion138@gmail.com
        'a0e5bb6e-e188-4036-93af-5d10bc364b9e'::uuid, -- Customer Feedback | Matched Email: info@cfeedback.com
        '489e0c68-88dc-40fc-a327-71f856d51a17'::uuid, -- Dashform | Matched Email: katie@tupley.ai
        '7786373d-38ed-489f-805e-61dfeb019033'::uuid, -- DatingShoot | Matched Email: support@datingshoot.com
        '5f7e07eb-4f6b-4dbf-9c81-5bc256e0cd81'::uuid, -- DevScribe | Matched Email: support@devscribe.app
        '71153f2f-48e6-4282-8e84-f06ec483ac74'::uuid, -- DMdaddy | Matched Email: info@dmdaddy.com
        'f420bd5e-b3d3-4bef-8064-5cc02967ca27'::uuid, -- drawmingo | Matched Email: support@drawmingo.com
        '5ed6622d-9072-49b4-a2d9-ad38f45d7206'::uuid, -- Dreamy DET | Matched Email: contact@info.dreamydet.com
        '255e9321-396c-4e6d-8b81-be515abd8c4b'::uuid, -- EasyBrainrot | Matched Email: support@easybrainrot.com
        '06079671-2b38-494f-a003-c48b52f91559'::uuid, -- eCyberForce LLC | Matched Email: ldoan@ecyberforce.com
        '14e64ebe-7090-48d6-9e1d-cba1c1fff1b3'::uuid, -- Edtech | Matched Email: contact@hellonabu.com
        'ad203ca4-9176-4750-928e-9902e7c36524'::uuid, -- Erasa | Matched Email: service.erasa@erasa.net
        '0d774ea8-219a-4ea6-ba98-cfd5028d1f99'::uuid, -- Flux 2 | Matched Email: hi@flux2ai.io
        '630f2e17-a7f3-49d6-b4ff-215659e46030'::uuid, -- Free Song Maker | Matched Email: contact@freesongmaker.org
        'a27a8c6b-c39e-4e5c-8df0-b2bef5cffd9a'::uuid, -- Genveo | Matched Email: support@genveo.net
        '294e053b-37d5-48aa-a099-c114b2c18c90'::uuid, -- GimmeAI | Matched Email: ningguagua@gmail.com
        '56574df9-3800-4cb2-915f-cfd79b526f7a'::uuid, -- Grok Imagine Free Generator - FSG AI | Matched Email: paidx2006@gmail.com
        'baa6f533-3578-4ebd-9571-5de00a52c70a'::uuid, -- headshotbook | Matched Email: support@headshotbook.com
        '852cd6ae-0830-4e7f-b903-520a1355c2cc'::uuid, -- Holover | Matched Email: valence@holover.ai
        'b7d9c2df-fb27-42e1-aaf1-41db47880adb'::uuid, -- Hooked AI | Matched Email: hookedai@mail.io
        'eb5e4eb9-86d7-45c3-a744-89c0b4f1a714'::uuid, -- HubVanta AI | Matched Email: hubvanta@gmail.com
        '4842c13a-9efa-486f-95fc-6c5aedb94cbe'::uuid, -- IG Follower Export Tool by Instalab AI | Matched Email: info@instalab.ai
        '85b5fdff-bd43-4969-8422-1c9067839da8'::uuid, -- Imagable AI | Matched Email: hoodee153@gmail.com
        '1892acba-698f-4d2b-bc83-e52a3a29e20a'::uuid, -- Image Animator AI | Matched Email: xuejuship@gmail.com
        '4e92521d-79ab-4b16-9ac1-d50c6de4f9ee'::uuid, -- Image to Image AI | Matched Email: hi@imgtoimgai.net
        '68522841-3e24-4a2e-948a-788baa0f96c2'::uuid, -- Image to Sketch | Lovnib | Matched Email: support@imagetosketch.org
        '2fe5929e-2d27-4f3b-b9c6-44676a3f1738'::uuid, -- Image to Video AI Generator Online | VeeGen | Matched Email: wangdh8088@gmail.com
        '630af460-943f-4968-890a-d8abc96d417b'::uuid, -- Image2PixelArt | Matched Email: limianfeng12@gmail.com
        '76e81653-b1af-47b2-9ee9-b39e72097eb3'::uuid, -- ImgArt Ai | Matched Email: support@imgart.net
        '19f52a1b-173c-4682-97bf-83379c38787a'::uuid, -- Importly.io | Matched Email: hello@importly.io
        '22672015-b20f-414e-8da9-dc48b68384a1'::uuid, -- Inbox Telecommunications | Matched Email: care@vapio.io
        '655d6fbf-c186-48d0-b737-36db0fc31e18'::uuid, -- Instant Photos | Matched Email: mail@instant.photos
        '25fe12db-9281-4106-aac0-00ffa6360ba3'::uuid, -- jaweb | Matched Email: info@jaweb.me
        '1897f79d-377d-436c-8d6b-ebdfa379e242'::uuid, -- Lyrics to Song AI | Matched Email: support@lyricstosong.io
        'ac70d638-4691-4ffb-b462-82b047e59f13'::uuid, -- Lyrics To Song AI | Matched Email: support@lyricstosongai.com
        '0f355ed0-64df-4edc-a25c-179dc5cb13ae'::uuid, -- m | Matched Email: team@ddtechsolution.com
        '565f1ab3-278e-491d-a550-b2dafdbcc7ee'::uuid, -- Macaron AI | Matched Email: zoudong376@gmail.com
        'd3361432-629a-4fc3-8305-7418a3bd5f93'::uuid, -- MapAtlas | Matched Email: brent.vanderheiden@mapatlas.xyz
        'cb82f4f2-b96d-4647-bfbe-a8ef1b8317c7'::uuid, -- melhorar imagem | Matched Email: zhamin246@gmail.com
        '0d532a7b-34b6-4b56-bbd7-a975dd0f781d'::uuid, -- Midjourney AI Prompts, Video, SREF Codes Library and Style Explorer | Matched Email: wanxiaoba123@gmail.com
        '8082fc1f-4ad3-47ac-8f46-48d48c0ea8bb'::uuid, -- MixHub AI | Matched Email: hello@mixhubai.com
        'c416760e-76fe-4d72-9760-7227b5e31c39'::uuid, -- Moterra AI | Matched Email: marketing@moterra.ai
        '248569f8-9a8c-43a1-a5b2-7db0217c828b'::uuid, -- MyClone | Matched Email: vignesh@myclone.is
        '130b1482-dd40-41ce-831c-9b8c79492b4b'::uuid, -- Nano AI | Matched Email: support@nanoai.love
        '4e64d1ae-d308-45cc-b2b7-d73395ad7345'::uuid, -- Nano Banana 2 | Matched Email: zemof@foxmail.com
        'ea605893-a3dc-4b00-99eb-7b50bb6216ff'::uuid, -- Nano Banana AI — AI Image Generator & Editor | Matched Email: francesstarkenx@gmail.com
        '5ed6a53d-8c5a-4d36-bcf6-6fe93b2f29f8'::uuid, -- Nano Banana Pro | Matched Email: choumeng1992@gmail.com
        'b057f72a-919f-48ce-87ae-cae3604d02cd'::uuid, -- Nano Banana Pro - AI Image Editor | Matched Email: francesstarkenx@gmail.com
        '93443d03-4915-4ea5-b10a-8f718ba78ce7'::uuid, -- nearerai | Matched Email: support@nearerai.com
        'ad79f65b-5da5-4099-b6ba-090be4e9798b'::uuid, -- Neo AI Presentation Maker | Matched Email: slideuplift0@gmail.com
        '1e5d2099-3371-4f88-ba79-d88d78b0e140'::uuid, -- numberchecker.ai | Matched Email: jessica@checknumber.ai
        'b33be163-b05c-49f7-bb2c-9333651161c0'::uuid, -- Online Clipboard | Matched Email: digiplanp@gmail.com
        '62398272-1cde-4bd6-9c36-2c1b299e6129'::uuid, -- PDF Translate | Matched Email: support@pdf-translation.com
        'b6162235-28f3-47a8-9d03-4ad2a59957e5'::uuid, -- PPT AI | Matched Email: franklin@ppt.ai
        '4cd904ff-d62f-44c7-806c-020a5d18b646'::uuid, -- Professional tool suite document sign | Matched Email: mksquare0225@gmail.com
        'eeaf4b39-8be0-42a3-8168-868b507c9535'::uuid, -- QORIS AI | Matched Email: support@qoris.ai
        'dae08f51-a1df-41d0-ac0a-db76fd638482'::uuid, -- Rank++ | Matched Email: hi@rankplusplus.com
        'ae4a7e44-9e90-407e-a875-ff39dfca331b'::uuid, -- refini | Matched Email: support@refini.ai
        'e28800c8-e4f7-4cad-a8ea-0cbc179f4428'::uuid, -- Remake Face AI | Matched Email: support@remakeface.ai
        '19877b5c-f486-4c05-9fa4-ae93d822c519'::uuid, -- RemakeCV | Matched Email: remakecvcom@gmail.com
        '8d202c83-d384-40bc-9ce8-ba884805d28c'::uuid, -- Renée Space | Matched Email: hello@reneespace.com
        'f28a1ff5-1cc2-4932-9ef0-538eca1a66de'::uuid, -- resumly.ai | Matched Email: hello@resumly.ai
        '08b8cf70-952c-42a6-934c-30ffc3a01ab8'::uuid, -- Rizzagic | Matched Email: contact@rizzagic.ai
        '8478c322-3fc0-49ee-b4f9-3a2cf6f01a6d'::uuid, -- RoleChar AI | Matched Email: rolechar@proton.me
        'fb029e63-0b1e-4a61-a55f-884820203ce4'::uuid, -- RoomX Ai -  Virtual Staging in 30 Seconds | Matched Email: jsdasww593@gmail.com
        '1d781a6e-7379-4197-90c8-89b529989a80'::uuid, -- SceneYou.art | Matched Email: support@sceneyou.art
        'd1c47689-2655-49a7-abf5-5385231097d2'::uuid, -- Scribbler | Matched Email: gopi@scribbler.live
        '706f6734-5cf7-4488-9cb7-6a88de22b251'::uuid, -- Seedream Pro | Matched Email: support@seedreampro.com
        '3abec827-04b3-491a-a2ea-7504494d1ac7'::uuid, -- Seekario | Matched Email: info@seekario.ai
        '4899dca4-6a48-436a-a297-1c47c745d9a8'::uuid, -- Serversage.ai | Matched Email: josh@serversage.ai
        '45da0905-bf8c-4217-b236-2879b96b984e'::uuid, -- Simple MP3 to Text Online Tool | Matched Email: rich2man@126.com
        '86b3c190-edfa-455e-81df-b092a5d9603e'::uuid, -- Sketch To | Matched Email: wujieli0207@outlook.com
        '7047dd2c-1cd9-4f38-8aca-95f834503a9b'::uuid, -- SmartSolve | Matched Email: admin@smartsolve.ai
        'e6d1603a-c1ac-44fe-9bd8-6d90077edd78'::uuid, -- Sociavault | Matched Email: ola@sociavault.com
        '34791f6c-e174-4202-9661-bb3684ee358c'::uuid, -- Sora 2 - Cinematic AI Video Generator with Audio | Matched Email: francesstarkenx@gmail.com
        '9d3592ea-036a-40cc-97f9-6b8344aee3d7'::uuid, -- Sora Watermark Remover | Matched Email: support@sorawatermarkremover.art
        '7da3e281-8337-42a0-b51e-ece744110ad8'::uuid, -- Start Right Now | Matched Email: hello@startrightnow.co
        'b2a99033-1787-4437-bdec-5ac1bb4c2032'::uuid, -- TattooCoverUp.AI - Revolutionary AI tattoo cover-up generator | Matched Email: support@tattoocoverup.ai
        '52670f95-d4a2-4826-beaf-880bef561588'::uuid, -- Text To Handwriting | Matched Email: zhx1098552056@gmail.com
        'f27c6648-7d11-48b6-9aa1-1d0509464835'::uuid, -- theaisurf | Matched Email: theaisurf2@gmail.com
        '42651431-50ba-45d7-9980-ae7fa2b3bf79'::uuid, -- Trading Bot Experts | Matched Email: hello@tradingbotexperts.com
        'd5ca870f-8234-49b2-b66c-3c2ab85859cb'::uuid, -- Transcript Generator AI | Matched Email: ylee26386@gmail.com
        '215a13ba-8b56-4e14-a919-d5c1e08eddbe'::uuid, -- Travel | Matched Email: john@zarlu.com
        '4093bd4d-ec43-48e9-9492-6da15b3eeb90'::uuid, -- Trust360 | Matched Email: peter@trust360.io
        '064d5b2e-35c8-42a5-813f-3b443fbf0f52'::uuid, -- TrustKernel | Matched Email: marketing@trustkernel.com
        '90cc7c4f-d86c-4f1d-9e37-78701e40ce84'::uuid, -- Try Nano Banana | Matched Email: support@trynanobanana.io
        '24a0a21d-905c-4127-8304-14951574594f'::uuid, -- Unlimited OCR | Matched Email: dreamspire.team@gmail.com
        'df341e3a-9e36-4164-9ddb-93c13aadb264'::uuid, -- URL to Any | Matched Email: wujieli0207@outlook.com
        'a352385b-f961-4129-b0c9-2a2335e48e57'::uuid, -- Veo 3.1 - Cinematic AI Video Generator with Audio | Matched Email: francesstarkenx@gmail.com
        '4eb4fe71-d96a-4a62-8e64-1a2a18564438'::uuid, -- Vertech Academy | Matched Email: vertechacademy01@outlook.com
        '5db55787-7d80-442a-866e-e539053a051d'::uuid, -- VibeMusicing | Matched Email: contact@vibemusicing.com
        'ada00896-1fa5-40cc-8725-5d19b36038c0'::uuid, -- Visual Field Test | Matched Email: visualfieldtest@gmail.com
        '25e78cbe-6de1-4816-bb9d-c912026e4304'::uuid, -- Waifu2x.live | Matched Email: hey.aiimage@gmail.com
        '9508572b-2314-4874-a069-2d6ee3e5f6d2'::uuid, -- Wan 2.5 AI Video Generator | Matched Email: oddboy0152@gmail.com
        '16bfd239-ebf8-432e-bd58-7ad5c9b31dc5'::uuid, -- WAN Animate - AI Character Animation Tool | Motion Capture | Matched Email: francesstarkenx@gmail.com
        'eb76d8ed-2514-44bf-b4dc-4aff0b623bb4'::uuid, -- WeInc | Matched Email: hey@we.inc
        'fca82e03-1212-4565-85ed-09958f557a10'::uuid, -- What Is This Movie | Matched Email: raxskle1@gmail.com
        '4f82da15-5b68-4ee0-9f51-a82baaef9671'::uuid, -- Wplace Live | Matched Email: lhari7850@gmail.com
        '07b30f00-96f6-4712-a1b6-50fe975a103c'::uuid, -- Z Image | Matched Email: zemof@foxmail.com
        'bdff49e0-f450-4684-b57b-e93251c30766'::uuid, -- Z-Image | Matched Email: hi@z-img.org
        'b1c6489b-20cf-473c-973a-7f123c2742e7'::uuid -- Zzo AI Image Generator | Matched Email: hi@zzo.ai
    );
END $$;
