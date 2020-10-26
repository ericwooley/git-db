#!/usr/bin/env bash

docker-compose exec -u postgres postgres psql -c "SELECT first_name, last_name FROM actor WHERE first_name='Eric' OR first_name='Pickle'"
