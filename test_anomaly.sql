DO $$ 
DECLARE 
  g_id UUID; 
  cap INT;
  member_record RECORD; 
BEGIN 
  SELECT id, capacity INTO g_id, cap FROM gyms WHERE capacity < 150 LIMIT 1; 
  FOR member_record IN SELECT id FROM members LIMIT (cap + 5) LOOP 
    INSERT INTO checkins (member_id, gym_id, checked_in) VALUES (member_record.id, g_id, NOW()); 
  END LOOP; 
END $$;
