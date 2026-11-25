#!/bin/sh
# Stages the illustrative friends thread (Maya, Noah) into the trip in trip.json.
TRIP=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("trip.json")).tripId)')
docker exec -i supabase_db_sb psql -U postgres -v ON_ERROR_STOP=1 -q <<SQL
insert into trip_members (trip_id,user_id,role) values ('$TRIP','b85b806a-0dd2-424d-84aa-5885abf6d08f','editor'),('$TRIP','3ae52e93-8ae5-4dae-8208-0267a527add6','editor') on conflict do nothing;
insert into group_messages (trip_id,user_id,role,kind,content,created_at) values
('$TRIP','b85b806a-0dd2-424d-84aa-5885abf6d08f','user','text','Lisbon in November?? I''m in 🙌', now() - interval '14 minutes'),
('$TRIP','3ae52e93-8ae5-4dae-8208-0267a527add6','user','text','Food and walking is all I need. Pastéis de nata count as a food group.', now() - interval '12 minutes'),
('$TRIP','b85b806a-0dd2-424d-84aa-5885abf6d08f','user','text','Can someone find us a Friday dinner that isn''t a tourist trap?', now() - interval '9 minutes');
SQL
echo seeded $TRIP
