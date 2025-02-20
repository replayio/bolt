#!/bin/bash

# Read from .env.local file
if [ -f .env.local ]; then
  source .env.local
fi

bindings=""
while IFS= read -r line || [ -n "$line" ]; do
  if [[ ! "$line" =~ ^# ]] && [[ -n "$line" ]]; then
    name=$(echo "$line" | cut -d '=' -f 1)
    value=$(echo "$line" | cut -d '=' -f 2-)
    value=$(echo $value | sed 's/^"\(.*\)"$/\1/')
    bindings+="--binding ${name}=${value} "
  fi
done < .env.local

bindings=$(echo $bindings | sed 's/[[:space:]]*$//')

echo "$bindings --binding SUPABASE_URL=$SUPABASE_URL --binding SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY"
