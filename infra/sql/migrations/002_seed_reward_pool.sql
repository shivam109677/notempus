INSERT INTO reward_pool (id, balance_paise)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
