#!/bin/bash
# Setup script for TinyMCE self-hosted
# Run this after npm install in production

echo "📦 Copying TinyMCE files to public directory..."

# Create public/tinymce if it doesn't exist
mkdir -p public/tinymce

# Copy TinyMCE files from node_modules
cp -r node_modules/tinymce/* public/tinymce/

echo "✅ TinyMCE setup complete!"
echo "Files copied to: public/tinymce/"
