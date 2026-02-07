#!/bin/bash

# Test script for dnglab makedng options
# Usage: ./test-makedng.sh input.jpg

INPUT="$1"
DNGLAB="./resources/bin/darwin/dnglab"
OUTPUT_DIR="./makedng-tests"

if [ -z "$INPUT" ]; then
    echo "Usage: ./test-makedng.sh <input-image.jpg>"
    exit 1
fi

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

if [ ! -f "$DNGLAB" ]; then
    echo "Error: dnglab not found at: $DNGLAB"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Testing dnglab makedng with various options..."
echo "Input: $INPUT"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Counter for test numbers
n=1

# Function to run a test
run_test() {
    local name="$1"
    local opts="$2"
    local output="$OUTPUT_DIR/test_$(printf '%02d' $n)_${name}.dng"
    
    echo "[$n] $name"
    echo "    Options: $opts"
    
    if $DNGLAB makedng -i "$INPUT" -o "$output" $opts --override 2>/dev/null; then
        echo "    ✓ Created: $output"
    else
        echo "    ✗ Failed"
    fi
    echo ""
    ((n++))
}

echo "========================================"
echo "GROUP 1: Minimal options"
echo "========================================"

run_test "minimal" ""

run_test "output-ref-only" "--colorimetric-reference output"

run_test "scene-ref-only" "--colorimetric-reference scene"

echo "========================================"
echo "GROUP 2: Matrix + Illuminant combos"
echo "========================================"

run_test "sRGB_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65"

run_test "sRGB_D50" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50"

run_test "AdobeRGB_D65" "--matrix1 XYZ_AdobeRGB_D65 --illuminant1 D65"

run_test "AdobeRGB_D50" "--matrix1 XYZ_AdobeRGB_D50 --illuminant1 D50"

echo "========================================"
echo "GROUP 3: With colorimetric-reference output"
echo "========================================"

run_test "sRGB_D65_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --colorimetric-reference output"

run_test "sRGB_D50_output" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --colorimetric-reference output"

run_test "AdobeRGB_D65_output" "--matrix1 XYZ_AdobeRGB_D65 --illuminant1 D65 --colorimetric-reference output"

run_test "AdobeRGB_D50_output" "--matrix1 XYZ_AdobeRGB_D50 --illuminant1 D50 --colorimetric-reference output"

echo "========================================"
echo "GROUP 4: With linearization (8bit_sRGB)"
echo "========================================"

run_test "sRGB_D65_lin" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB"

run_test "sRGB_D65_lin_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB --colorimetric-reference output"

run_test "sRGB_D50_lin_output" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --linearization 8bit_sRGB --colorimetric-reference output"

echo "========================================"
echo "GROUP 5: With linearization inverted"
echo "========================================"

run_test "sRGB_D65_lin_inv" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB_invert"

run_test "sRGB_D65_lin_inv_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB_invert --colorimetric-reference output"

run_test "sRGB_D50_lin_inv_output" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --linearization 8bit_sRGB_invert --colorimetric-reference output"

echo "========================================"
echo "GROUP 6: With white balance"
echo "========================================"

run_test "sRGB_D65_wb_neutral" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 1.0,1.0,1.0"

run_test "sRGB_D65_output_wb" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --colorimetric-reference output --wb 1.0,1.0,1.0"

run_test "sRGB_D65_lin_output_wb" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB --colorimetric-reference output --wb 1.0,1.0,1.0"

echo "========================================"
echo "GROUP 7: With white-xy"
echo "========================================"

run_test "sRGB_D65_whitexy_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy D65"

run_test "sRGB_D65_whitexy_D50" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy D50"

run_test "sRGB_D65_output_whitexy" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --colorimetric-reference output --white-xy D65"

run_test "sRGB_D65_lin_output_whitexy" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB --colorimetric-reference output --white-xy D65"

echo "========================================"
echo "GROUP 8: Identity matrix tests"
echo "========================================"

run_test "identity_D65" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 D65"

run_test "identity_D65_output" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 D65 --colorimetric-reference output"

run_test "identity_D65_lin_output" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 D65 --linearization 8bit_sRGB --colorimetric-reference output"

echo "========================================"
echo "GROUP 9: Gamma variations"
echo "========================================"

run_test "sRGB_D65_gamma22" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_gamma2.2"

run_test "sRGB_D65_gamma22_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_gamma2.2 --colorimetric-reference output"

run_test "sRGB_D65_gamma22_inv" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_gamma2.2_invert"

run_test "sRGB_D65_gamma22_inv_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_gamma2.2_invert --colorimetric-reference output"

echo "========================================"
echo "GROUP 10: DNG version variations"
echo "========================================"

run_test "sRGB_D65_output_dng16" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --colorimetric-reference output --dng-backward-version 1.6"

run_test "sRGB_D65_lin_output_dng16" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB --colorimetric-reference output --dng-backward-version 1.6"

echo "========================================"
echo "DONE!"
echo "========================================"
echo ""
echo "Created $((n-1)) test files in $OUTPUT_DIR"
echo ""
echo "Open the folder and compare the DNG files to find the correct settings:"
echo "  open $OUTPUT_DIR"
