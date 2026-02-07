#!/bin/bash
# Test script to check if DNGLab conversion changes brightness

echo "This will help diagnose the brightness issue"
echo "Please provide an ARW file path when prompted"
echo ""
read -p "Enter path to ARW file: " ARW_FILE

if [ ! -f "$ARW_FILE" ]; then
    echo "File not found!"
    exit 1
fi

OUTPUT_DIR=$(dirname "$ARW_FILE")/brightness-test
mkdir -p "$OUTPUT_DIR"

BASENAME=$(basename "$ARW_FILE" .ARW)
DNG_OUTPUT="$OUTPUT_DIR/${BASENAME}-test.dng"

echo ""
echo "Converting without metadata copy..."
./resources/bin/darwin/dnglab convert --embed-raw false --dng-preview true --override "$ARW_FILE" "$DNG_OUTPUT"

echo ""
echo "Files created:"
echo "Original: $ARW_FILE"
echo "Converted: $DNG_OUTPUT"
echo ""
echo "Open both in your RAW viewer and compare brightness."
echo "If they differ, the issue is in DNGLab conversion itself."
