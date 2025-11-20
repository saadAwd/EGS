#!/bin/bash

# Convert all zone PNG images to WebP format
# This script keeps the original PNG files as fallbacks

ASSETS_DIR="src/assets"
QUALITY=85  # WebP quality (0-100, 85 is a good balance)

echo "Converting PNG zone images to WebP format..."

# Find all zone PNG files (excluding logo and other non-zone images)
find "$ASSETS_DIR" -name "Zone*.png" -o -name "All Zones.png" | while read -r png_file; do
    webp_file="${png_file%.png}.webp"
    
    if [ ! -f "$webp_file" ]; then
        echo "Converting: $png_file -> $webp_file"
        cwebp -q "$QUALITY" "$png_file" -o "$webp_file"
        
        if [ $? -eq 0 ]; then
            echo "✓ Successfully converted: $(basename "$png_file")"
        else
            echo "✗ Failed to convert: $(basename "$png_file")"
        fi
    else
        echo "⊘ Already exists: $(basename "$webp_file")"
    fi
done

echo "Conversion complete!"

