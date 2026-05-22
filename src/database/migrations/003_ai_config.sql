-- AI provider configuration (one row per key)
CREATE TABLE IF NOT EXISTS ai_config (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT ''
);

-- Per-network tag lists; is_default=1 tags ship with the app, is_default=0 = user-added.
CREATE TABLE IF NOT EXISTS network_tags (
  id         TEXT PRIMARY KEY NOT NULL,
  network    TEXT NOT NULL,
  tag        TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  UNIQUE (network, tag)
);

-- ── Default tags per network ────────────────────────────────────────────────
-- X / Twitter (use # prefix in posts)
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_x_01','x','#art',1), ('nt_x_02','x','#digitalart',1), ('nt_x_03','x','#drawing',1),
  ('nt_x_04','x','#illustration',1), ('nt_x_05','x','#anime',1), ('nt_x_06','x','#fanart',1),
  ('nt_x_07','x','#oc',1), ('nt_x_08','x','#commission',1), ('nt_x_09','x','#artist',1),
  ('nt_x_10','x','#aiart',1), ('nt_x_11','x','#midjourney',1), ('nt_x_12','x','#stablediffusion',1),
  ('nt_x_13','x','#artwork',1), ('nt_x_14','x','#sketch',1), ('nt_x_15','x','#painting',1),
  ('nt_x_16','x','#characterdesign',1), ('nt_x_17','x','#conceptart',1), ('nt_x_18','x','#digitalpainting',1),
  ('nt_x_19','x','#manga',1), ('nt_x_20','x','#nsfw',1), ('nt_x_21','x','#sfw',1),
  ('nt_x_22','x','#pinup',1), ('nt_x_23','x','#procreate',1), ('nt_x_24','x','#wip',1);

-- Bluesky (# prefix used in text)
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_bs_01','bluesky','#art',1), ('nt_bs_02','bluesky','#digitalart',1), ('nt_bs_03','bluesky','#illustration',1),
  ('nt_bs_04','bluesky','#drawing',1), ('nt_bs_05','bluesky','#anime',1), ('nt_bs_06','bluesky','#fanart',1),
  ('nt_bs_07','bluesky','#oc',1), ('nt_bs_08','bluesky','#commission',1), ('nt_bs_09','bluesky','#artist',1),
  ('nt_bs_10','bluesky','#aiart',1), ('nt_bs_11','bluesky','#artwork',1), ('nt_bs_12','bluesky','#sketch',1),
  ('nt_bs_13','bluesky','#painting',1), ('nt_bs_14','bluesky','#characterdesign',1), ('nt_bs_15','bluesky','#nobot',1),
  ('nt_bs_16','bluesky','#AIArt',1), ('nt_bs_17','bluesky','#procreate',1), ('nt_bs_18','bluesky','#conceptart',1);

-- DeviantArt (no # symbol — DA has a separate tag field)
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_da_01','deviantart','digital art',1), ('nt_da_02','deviantart','traditional art',1),
  ('nt_da_03','deviantart','anime',1), ('nt_da_04','deviantart','manga',1), ('nt_da_05','deviantart','fantasy',1),
  ('nt_da_06','deviantart','sci-fi',1), ('nt_da_07','deviantart','portrait',1),
  ('nt_da_08','deviantart','character design',1), ('nt_da_09','deviantart','commission',1),
  ('nt_da_10','deviantart','fan art',1), ('nt_da_11','deviantart','original character',1),
  ('nt_da_12','deviantart','digital painting',1), ('nt_da_13','deviantart','illustration',1),
  ('nt_da_14','deviantart','concept art',1), ('nt_da_15','deviantart','watercolor',1),
  ('nt_da_16','deviantart','sketch',1), ('nt_da_17','deviantart','chibi',1),
  ('nt_da_18','deviantart','speedpaint',1), ('nt_da_19','deviantart','3D art',1), ('nt_da_20','deviantart','nsfw',1);

-- Civitai (AI-specific, no # symbol)
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_cv_01','civitai','stable diffusion',1), ('nt_cv_02','civitai','SDXL',1), ('nt_cv_03','civitai','LoRA',1),
  ('nt_cv_04','civitai','portrait',1), ('nt_cv_05','civitai','landscape',1), ('nt_cv_06','civitai','anime',1),
  ('nt_cv_07','civitai','realistic',1), ('nt_cv_08','civitai','fantasy',1), ('nt_cv_09','civitai','sci-fi',1),
  ('nt_cv_10','civitai','NSFW',1), ('nt_cv_11','civitai','SFW',1), ('nt_cv_12','civitai','photorealistic',1),
  ('nt_cv_13','civitai','digital art',1), ('nt_cv_14','civitai','concept art',1), ('nt_cv_15','civitai','character',1),
  ('nt_cv_16','civitai','1girl',1), ('nt_cv_17','civitai','1boy',1), ('nt_cv_18','civitai','masterpiece',1),
  ('nt_cv_19','civitai','cinematic',1), ('nt_cv_20','civitai','detailed',1), ('nt_cv_21','civitai','pinup',1),
  ('nt_cv_22','civitai','checkpoint',1), ('nt_cv_23','civitai','flux',1);

-- Instagram (# prefix in caption)
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_ig_01','instagram','#art',1), ('nt_ig_02','instagram','#digitalart',1), ('nt_ig_03','instagram','#illustration',1),
  ('nt_ig_04','instagram','#drawing',1), ('nt_ig_05','instagram','#anime',1), ('nt_ig_06','instagram','#fanart',1),
  ('nt_ig_07','instagram','#artwork',1), ('nt_ig_08','instagram','#artist',1), ('nt_ig_09','instagram','#sketch',1),
  ('nt_ig_10','instagram','#painting',1), ('nt_ig_11','instagram','#design',1), ('nt_ig_12','instagram','#creative',1),
  ('nt_ig_13','instagram','#instaart',1), ('nt_ig_14','instagram','#artofinstagram',1),
  ('nt_ig_15','instagram','#digitalpainting',1), ('nt_ig_16','instagram','#characterdesign',1),
  ('nt_ig_17','instagram','#conceptart',1), ('nt_ig_18','instagram','#procreate',1),
  ('nt_ig_19','instagram','#commission',1), ('nt_ig_20','instagram','#artshare',1),
  ('nt_ig_21','instagram','#artistsoninstagram',1), ('nt_ig_22','instagram','#oc',1),
  ('nt_ig_23','instagram','#originalcharacter',1), ('nt_ig_24','instagram','#aiart',1);

-- Tumblr (no # symbol — Tumblr has a separate tag input)
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_tb_01','tumblr','art',1), ('nt_tb_02','tumblr','my art',1), ('nt_tb_03','tumblr','digital art',1),
  ('nt_tb_04','tumblr','oc',1), ('nt_tb_05','tumblr','original character',1), ('nt_tb_06','tumblr','fanart',1),
  ('nt_tb_07','tumblr','commission',1), ('nt_tb_08','tumblr','anime',1), ('nt_tb_09','tumblr','illustration',1),
  ('nt_tb_10','tumblr','painting',1), ('nt_tb_11','tumblr','drawing',1),
  ('nt_tb_12','tumblr','commissions open',1), ('nt_tb_13','tumblr','aesthetic',1),
  ('nt_tb_14','tumblr','character art',1), ('nt_tb_15','tumblr','concept art',1),
  ('nt_tb_16','tumblr','wip',1), ('nt_tb_17','tumblr','sketch',1), ('nt_tb_18','tumblr','aiart',1);

-- Facebook (# prefix)
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_fb_01','facebook','#art',1), ('nt_fb_02','facebook','#digitalart',1), ('nt_fb_03','facebook','#illustration',1),
  ('nt_fb_04','facebook','#drawing',1), ('nt_fb_05','facebook','#painting',1), ('nt_fb_06','facebook','#fanart',1),
  ('nt_fb_07','facebook','#originalart',1), ('nt_fb_08','facebook','#commission',1),
  ('nt_fb_09','facebook','#artist',1), ('nt_fb_10','facebook','#artwork',1),
  ('nt_fb_11','facebook','#creative',1), ('nt_fb_12','facebook','#design',1);
