-- 032_claim_gift_with_verified_email.sql
--
-- Gift recipients prove control of the gifted email before ownership is
-- created. The API verifies the code first, then this transaction claims the
-- gift, creates the user, creates the Footprint, and binds the gift atomically.

CREATE OR REPLACE FUNCTION claim_gift_with_verified_email(
  p_gift_id UUID,
  p_email TEXT,
  p_username TEXT,
  p_edit_token TEXT
)
RETURNS TABLE (
  claimed_user_id UUID,
  claimed_serial_number INTEGER,
  claimed_username TEXT,
  claimed_edit_token TEXT
) AS $$
DECLARE
  gift_row gifts%ROWTYPE;
  existing_user_id UUID;
  existing_footprint_id UUID;
  next_serial INTEGER;
  new_user_id UUID;
BEGIN
  SELECT *
    INTO gift_row
    FROM gifts
    WHERE id = p_gift_id
    FOR UPDATE;

  IF NOT FOUND OR gift_row.claimed IS TRUE THEN
    RAISE EXCEPTION 'gift_already_claimed';
  END IF;

  IF lower(trim(gift_row.recipient_email)) <> lower(trim(p_email)) THEN
    RAISE EXCEPTION 'recipient_email_mismatch';
  END IF;

  SELECT footprints.id
    INTO existing_footprint_id
    FROM footprints
    WHERE footprints.username = p_username
    LIMIT 1;

  IF existing_footprint_id IS NOT NULL THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  SELECT users.id
    INTO existing_user_id
    FROM users
    WHERE lower(users.email) = lower(trim(p_email))
    LIMIT 1;

  IF existing_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'email_already_owns_footprint';
  END IF;

  SELECT claim_next_serial() INTO next_serial;

  IF next_serial IS NULL THEN
    RAISE EXCEPTION 'serial_claim_failed';
  END IF;

  INSERT INTO users (email, serial_number, gifts_remaining)
  VALUES (lower(trim(p_email)), next_serial, 2)
  RETURNING id INTO new_user_id;

  INSERT INTO footprints (
    user_id,
    username,
    serial_number,
    edit_token,
    name,
    icon,
    is_primary,
    published
  )
  VALUES (
    new_user_id,
    p_username,
    next_serial,
    p_edit_token,
    'Everything',
    '◈',
    true,
    true
  );

  UPDATE gifts
    SET claimed = true,
        claimed_by = new_user_id,
        claimed_at = now()
    WHERE id = p_gift_id
      AND claimed = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_already_claimed';
  END IF;

  claimed_user_id := new_user_id;
  claimed_serial_number := next_serial;
  claimed_username := p_username;
  claimed_edit_token := p_edit_token;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
