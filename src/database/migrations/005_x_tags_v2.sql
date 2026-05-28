-- Migration 005: Replace generic X/Twitter default tags with a curated
-- NSFW / adult AI-art tag pool (4–7 per post picked by the AI from this list).
--
-- Removes all is_default=1 X tags from 003 and inserts the new set.
-- User-added tags (is_default=0) are NOT touched.

DELETE FROM network_tags WHERE network = 'x' AND is_default = 1;

-- ── Core / always good ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_x2_01','x','#aiart',1),
  ('nt_x2_02','x','#aiartwork',1),
  ('nt_x2_03','x','#digitalart',1),
  ('nt_x2_04','x','#illustration',1),
  ('nt_x2_05','x','#characterdesign',1),
  ('nt_x2_06','x','#aiartist',1),
  ('nt_x2_07','x','#aiillustration',1),
  ('nt_x2_08','x','#art',1),
  ('nt_x2_09','x','#digitalillustration',1);

-- ── NSFW / Adult ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_x2_10','x','#nsfw',1),
  ('nt_x2_11','x','#nsfwart',1),
  ('nt_x2_12','x','#lewd',1),
  ('nt_x2_13','x','#lewdart',1),
  ('nt_x2_14','x','#eroticart',1),
  ('nt_x2_15','x','#adultart',1),
  ('nt_x2_16','x','#hornyart',1),
  ('nt_x2_17','x','#sexyart',1),
  ('nt_x2_18','x','#twitterafterdark',1),
  ('nt_x2_19','x','#18plus',1);

-- ── Futa / Futanari ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_x2_20','x','#futa',1),
  ('nt_x2_21','x','#futanari',1),
  ('nt_x2_22','x','#futaart',1),
  ('nt_x2_23','x','#futagirl',1),
  ('nt_x2_24','x','#futanariart',1),
  ('nt_x2_25','x','#futaNSFW',1);

-- ── TGirl / Trans ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_x2_26','x','#tgirl',1),
  ('nt_x2_27','x','#transgirl',1),
  ('nt_x2_28','x','#trans',1),
  ('nt_x2_29','x','#mtf',1),
  ('nt_x2_30','x','#transart',1),
  ('nt_x2_31','x','#transwoman',1);

-- ── Anime / Hentai / Style ───────────────────────────────────────────────────
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_x2_32','x','#anime',1),
  ('nt_x2_33','x','#animeart',1),
  ('nt_x2_34','x','#hentai',1),
  ('nt_x2_35','x','#ecchi',1),
  ('nt_x2_36','x','#animegirl',1),
  ('nt_x2_37','x','#animestyle',1);

-- ── Fantasy / Fetish / Outfit ────────────────────────────────────────────────
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_x2_38','x','#succubus',1),
  ('nt_x2_39','x','#demongirl',1),
  ('nt_x2_40','x','#latex',1),
  ('nt_x2_41','x','#latexfashion',1),
  ('nt_x2_42','x','#rubber',1),
  ('nt_x2_43','x','#latexgirl',1),
  ('nt_x2_44','x','#goth',1),
  ('nt_x2_45','x','#fantasyart',1),
  ('nt_x2_46','x','#curvy',1),
  ('nt_x2_47','x','#thicc',1),
  ('nt_x2_48','x','#bigboobs',1);

-- ── Extra / Reach ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO network_tags (id, network, tag, is_default) VALUES
  ('nt_x2_49','x','#ai',1),
  ('nt_x2_50','x','#generativeart',1),
  ('nt_x2_51','x','#oc',1),
  ('nt_x2_52','x','#bdsm',1),
  ('nt_x2_53','x','#femdom',1),
  ('nt_x2_54','x','#kink',1),
  ('nt_x2_55','x','#feminization',1);
