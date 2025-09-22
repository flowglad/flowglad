#!/bin/bash

# Check for the correct number of arguments
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 source_env_file target_env_file"
    exit 1
fi

# Assign variables for clarity
src_env_file="$1"
target_env_file="$2"

# Check if source file exists
if [ ! -f "$src_env_file" ]; then
    echo "Source file $src_env_file does not exist."
    exit 2
fi

# Check if target file exists
if [ ! -f "$target_env_file" ]; then
    echo "Target file $target_env_file does not exist."
    exit 3
fi

# Concatenate the source env file to the end of the target env file
cat "$src_env_file" >> "$target_env_file"

# Get the LOCAL_USER variable from the .env_user file
local_user=$(grep '^LOCAL_USER=' "$src_env_file" | cut -d '=' -f2)

# Strip the ${local_user} part from the existing variables in the target env file
# Mac OS's implementation of sed forces us to write to a tmp file. This is compatible across all Linux systems
sed -e "s/${local_user}_TRIGGER_API_KEY/TRIGGER_API_KEY/" \
    -e "s/${local_user}_TRIGGER_SECRET_KEY/TRIGGER_SECRET_KEY/" \
    -e "s/${local_user}_DEV_EMAIL_REDIRECT/DEV_EMAIL_REDIRECT/" \
    "$target_env_file" > tmp_file

# Overwrite the target env file with the modified content
mv tmp_file "$target_env_file"

# Inform the user
echo "Contents of $src_env_file have been appended to $target_env_file."
