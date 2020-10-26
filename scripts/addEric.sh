#!/usr/bin/env bash

docker-compose exec -u postgres postgres psql -c "INSERT INTO actor (first_name, last_name) VALUES ('Eric', 'Wooley')"
