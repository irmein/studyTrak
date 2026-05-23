#!/bin/bash

echo "--- Git Identity Setup (Local Repo) ---"

# Prompt user for input
read -p "Enter your Full Name: " gitname
read -p "Enter your Email: " gitemail

# Check if we are inside a git repository
if [ -d .git ] || git rev-parse --git-dir > /dev/null 2>&1; then

    # Validate email format before setting
    if ! [[ "$gitemail" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        echo "❌ Error: Invalid email format."
        exit 1
    fi

    # Set local configuration
    git config user.name "$gitname"
    git config user.email "$gitemail"

    # Set remote URL if not already configured
    current_remote=$(git remote get-url origin 2>/dev/null)
    if [ -z "$current_remote" ]; then
        read -p "Enter remote URL (e.g. https://github.com/user/repo.git): " remote_url
        if [ -n "$remote_url" ]; then
            git remote add origin "$remote_url"
            echo "🔗 Remote set to: $remote_url"
        else
            echo "⚠️  No remote URL provided — skipped."
        fi
    else
        echo "🔗 Remote already set: $current_remote"
    fi

    echo "✅ Success! Local repo settings updated:"
    echo "Name: $gitname"
    echo "Email: $gitemail"
else
    echo "❌ Error: This directory is not a Git repository."
    echo "Please run this script inside a project folder."
    exit 1
fi
