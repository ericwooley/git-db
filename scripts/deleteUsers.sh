#!/usr/bin/env bash

docker-compose exec -u postgres postgres psql -c \
  "DELETE FROM actor WHERE first_name='Eric' OR first_name='Pickle'"
