#!/bin/bash

# Test script for dnglab makedng - Focus on white point / illuminant variations
# Usage: ./test-whitepoint.sh input.jpg

INPUT="$1"
DNGLAB="./resources/bin/darwin/dnglab"
OUTPUT_DIR="./makedng-whitepoint-tests"

if [ -z "$INPUT" ]; then
    echo "Usage: ./test-whitepoint.sh <input-image.jpg>"
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
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

echo "Testing dnglab makedng - White Point / Illuminant variations"
echo "Input: $INPUT"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Counter
n=1
failed=0
success=0

run_test() {
    local name="$1"
    local opts="$2"
    local output="$OUTPUT_DIR/$(printf '%03d' $n)_${name}.dng"
    
    printf "[%3d] %-70s " $n "$name"
    
    if $DNGLAB makedng -i "$INPUT" -o "$output" $opts --override 2>/dev/null; then
        echo "✓"
        ((success++))
    else
        echo "✗ FAILED"
        ((failed++))
    fi
    ((n++))
}

# Base settings that worked (8bit_sRGB_invert)
BASE_LIN="--linearization 8bit_sRGB_invert"
BASE_COLORREF="--colorimetric-reference output"

# ========================================
# SECTION 1: All standard illuminants
# ========================================
echo ""
echo "=== SECTION 1: Standard Illuminants (sRGB matrix) ==="

for illum in "A" "B" "C" "D50" "D55" "D65" "D75" "E" "Fluorescent" "Tungsten" "Flash" "Unknown"; do
    run_test "illum_${illum}" "--matrix1 XYZ_sRGB_D65 --illuminant1 $illum $BASE_LIN $BASE_COLORREF"
done

# ========================================
# SECTION 2: Illuminant with matching matrix
# ========================================
echo ""
echo "=== SECTION 2: Matrix matched to Illuminant ==="

run_test "matrix_D50_illum_D50" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 $BASE_LIN $BASE_COLORREF"
run_test "matrix_D65_illum_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 $BASE_LIN $BASE_COLORREF"
run_test "matrix_D50_illum_D65" "--matrix1 XYZ_sRGB_D50 --illuminant1 D65 $BASE_LIN $BASE_COLORREF"
run_test "matrix_D65_illum_D50" "--matrix1 XYZ_sRGB_D65 --illuminant1 D50 $BASE_LIN $BASE_COLORREF"

run_test "adobeRGB_D50_illum_D50" "--matrix1 XYZ_AdobeRGB_D50 --illuminant1 D50 $BASE_LIN $BASE_COLORREF"
run_test "adobeRGB_D65_illum_D65" "--matrix1 XYZ_AdobeRGB_D65 --illuminant1 D65 $BASE_LIN $BASE_COLORREF"
run_test "adobeRGB_D50_illum_D65" "--matrix1 XYZ_AdobeRGB_D50 --illuminant1 D65 $BASE_LIN $BASE_COLORREF"
run_test "adobeRGB_D65_illum_D50" "--matrix1 XYZ_AdobeRGB_D65 --illuminant1 D50 $BASE_LIN $BASE_COLORREF"

# ========================================
# SECTION 3: White-XY standard values
# ========================================
echo ""
echo "=== SECTION 3: White-XY Standard Values ==="

for whitexy in "D50" "D55" "D65" "D75"; do
    run_test "whitexy_${whitexy}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy $whitexy $BASE_LIN $BASE_COLORREF"
done

# ========================================
# SECTION 4: Custom White-XY coordinates
# ========================================
echo ""
echo "=== SECTION 4: Custom White-XY Coordinates ==="

# Standard illuminant xy chromaticity coordinates
# D50:  x=0.34567, y=0.35850
# D55:  x=0.33242, y=0.34743
# D65:  x=0.31272, y=0.32903
# D75:  x=0.29902, y=0.31485
# A:    x=0.44757, y=0.40745
# E:    x=0.33333, y=0.33333

run_test "xy_D50_exact" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy 0.34567,0.35850 $BASE_LIN $BASE_COLORREF"
run_test "xy_D55_exact" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy 0.33242,0.34743 $BASE_LIN $BASE_COLORREF"
run_test "xy_D65_exact" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy 0.31272,0.32903 $BASE_LIN $BASE_COLORREF"
run_test "xy_D75_exact" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy 0.29902,0.31485 $BASE_LIN $BASE_COLORREF"
run_test "xy_A_exact" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy 0.44757,0.40745 $BASE_LIN $BASE_COLORREF"
run_test "xy_E_exact" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy 0.33333,0.33333 $BASE_LIN $BASE_COLORREF"

# ========================================
# SECTION 5: Illuminant + White-XY combinations
# ========================================
echo ""
echo "=== SECTION 5: Illuminant + Matching White-XY ==="

run_test "illum_D50_xy_D50" "--matrix1 XYZ_sRGB_D65 --illuminant1 D50 --white-xy D50 $BASE_LIN $BASE_COLORREF"
run_test "illum_D65_xy_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy D65 $BASE_LIN $BASE_COLORREF"
run_test "illum_D50_xy_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 D50 --white-xy D65 $BASE_LIN $BASE_COLORREF"
run_test "illum_D65_xy_D50" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy D50 $BASE_LIN $BASE_COLORREF"

# ========================================
# SECTION 6: Matrix D50 with various illuminants
# ========================================
echo ""
echo "=== SECTION 6: Matrix D50 + Various Illuminants ==="

for illum in "A" "D50" "D55" "D65" "D75"; do
    run_test "matrixD50_illum_${illum}" "--matrix1 XYZ_sRGB_D50 --illuminant1 $illum $BASE_LIN $BASE_COLORREF"
done

for illum in "A" "D50" "D55" "D65" "D75"; do
    run_test "matrixD50_illum_${illum}_xyD50" "--matrix1 XYZ_sRGB_D50 --illuminant1 $illum --white-xy D50 $BASE_LIN $BASE_COLORREF"
done

# ========================================
# SECTION 7: Dual illuminant profiles
# ========================================
echo ""
echo "=== SECTION 7: Dual Illuminant Profiles ==="

run_test "dual_A_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 A --matrix2 XYZ_sRGB_D65 --illuminant2 D65 $BASE_LIN $BASE_COLORREF"
run_test "dual_D50_D65" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --matrix2 XYZ_sRGB_D65 --illuminant2 D65 $BASE_LIN $BASE_COLORREF"
run_test "dual_Tungsten_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 Tungsten --matrix2 XYZ_sRGB_D65 --illuminant2 D65 $BASE_LIN $BASE_COLORREF"
run_test "dual_Flash_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 Flash --matrix2 XYZ_sRGB_D65 --illuminant2 D65 $BASE_LIN $BASE_COLORREF"

# ========================================
# SECTION 8: White balance adjustments
# ========================================
echo ""
echo "=== SECTION 8: White Balance Multipliers ==="

# Neutral
run_test "wb_neutral" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 1.0,1.0,1.0 $BASE_LIN $BASE_COLORREF"

# Warmer (more red/yellow)
run_test "wb_warm1" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 1.1,1.0,0.9 $BASE_LIN $BASE_COLORREF"
run_test "wb_warm2" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 1.2,1.0,0.8 $BASE_LIN $BASE_COLORREF"
run_test "wb_warm3" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 1.3,1.0,0.7 $BASE_LIN $BASE_COLORREF"

# Cooler (more blue)
run_test "wb_cool1" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 0.9,1.0,1.1 $BASE_LIN $BASE_COLORREF"
run_test "wb_cool2" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 0.8,1.0,1.2 $BASE_LIN $BASE_COLORREF"
run_test "wb_cool3" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 0.7,1.0,1.3 $BASE_LIN $BASE_COLORREF"

# Green/Magenta tint
run_test "wb_green" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 1.0,1.1,1.0 $BASE_LIN $BASE_COLORREF"
run_test "wb_magenta" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb 1.0,0.9,1.0 $BASE_LIN $BASE_COLORREF"

# ========================================
# SECTION 9: Scene vs Output colorimetric
# ========================================
echo ""
echo "=== SECTION 9: Scene vs Output Reference ==="

for illum in "D50" "D65"; do
    run_test "illum_${illum}_scene" "--matrix1 XYZ_sRGB_D65 --illuminant1 $illum $BASE_LIN --colorimetric-reference scene"
    run_test "illum_${illum}_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 $illum $BASE_LIN --colorimetric-reference output"
done

# ========================================
# SECTION 10: No linearization tests
# ========================================
echo ""
echo "=== SECTION 10: Without Linearization ==="

for illum in "D50" "D55" "D65" "D75"; do
    run_test "no_lin_illum_${illum}" "--matrix1 XYZ_sRGB_D65 --illuminant1 $illum $BASE_COLORREF"
done

# ========================================
# SECTION 11: Different gamma with illuminants
# ========================================
echo ""
echo "=== SECTION 11: Gamma Variations + Illuminants ==="

for gamma in "8bit_gamma2.2_invert" "8bit_gamma2.4_invert" "8bit_gamma1.8_invert"; do
    for illum in "D50" "D65"; do
        gamma_short=$(echo "$gamma" | sed 's/8bit_//' | sed 's/_invert/inv/')
        run_test "${gamma_short}_illum_${illum}" "--matrix1 XYZ_sRGB_D65 --illuminant1 $illum --linearization $gamma $BASE_COLORREF"
    done
done

# ========================================
# DONE
# ========================================
echo ""
echo "========================================"
echo "COMPLETE!"
echo "========================================"
echo ""
echo "Total tests: $((n-1))"
echo "Successful:  $success"
echo "Failed:      $failed"
echo ""
echo "Output directory: $OUTPUT_DIR"
echo ""
echo "To open and compare:"
echo "  open $OUTPUT_DIR"
