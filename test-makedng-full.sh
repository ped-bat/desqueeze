#!/bin/bash

# Comprehensive test script for dnglab makedng options - 200+ variations
# Usage: ./test-makedng-full.sh input.jpg

INPUT="$1"
DNGLAB="./resources/bin/darwin/dnglab"
OUTPUT_DIR="./makedng-tests-full"

if [ -z "$INPUT" ]; then
    echo "Usage: ./test-makedng-full.sh <input-image.jpg>"
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

echo "Testing dnglab makedng with 200+ variations..."
echo "Input: $INPUT"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Counter for test numbers
n=1
failed=0
success=0

# Function to run a test
run_test() {
    local name="$1"
    local opts="$2"
    local output="$OUTPUT_DIR/$(printf '%03d' $n)_${name}.dng"
    
    printf "[%3d] %-60s " $n "$name"
    
    if $DNGLAB makedng -i "$INPUT" -o "$output" $opts --override 2>/dev/null; then
        echo "✓"
        ((success++))
    else
        echo "✗ FAILED"
        ((failed++))
    fi
    ((n++))
}

# ========================================
# SECTION 1: Baseline / Minimal
# ========================================
echo ""
echo "=== SECTION 1: Minimal ==="

run_test "minimal_no_opts" ""

# ========================================
# SECTION 2: Single colorimetric reference
# ========================================
echo ""
echo "=== SECTION 2: Colorimetric Reference Only ==="

run_test "colorref_scene" "--colorimetric-reference scene"
run_test "colorref_output" "--colorimetric-reference output"

# ========================================
# SECTION 3: All Matrix + Illuminant combos (no other options)
# ========================================
echo ""
echo "=== SECTION 3: Matrix + Illuminant Combinations ==="

for matrix in "XYZ_sRGB_D50" "XYZ_sRGB_D65" "XYZ_AdobeRGB_D50" "XYZ_AdobeRGB_D65"; do
    for illum in "D50" "D55" "D65" "D75"; do
        name="${matrix}_${illum}"
        run_test "$name" "--matrix1 $matrix --illuminant1 $illum"
    done
done

# Identity matrix
for illum in "D50" "D55" "D65" "D75"; do
    run_test "identity_${illum}" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 $illum"
done

# ========================================
# SECTION 4: Matrix + Illuminant + Colorimetric Reference
# ========================================
echo ""
echo "=== SECTION 4: Matrix + Illuminant + Colorimetric Reference ==="

for matrix in "XYZ_sRGB_D50" "XYZ_sRGB_D65" "XYZ_AdobeRGB_D50" "XYZ_AdobeRGB_D65"; do
    for illum in "D50" "D65"; do
        for colorref in "scene" "output"; do
            name="${matrix}_${illum}_${colorref}"
            run_test "$name" "--matrix1 $matrix --illuminant1 $illum --colorimetric-reference $colorref"
        done
    done
done

# ========================================
# SECTION 5: All Linearization options with sRGB D65
# ========================================
echo ""
echo "=== SECTION 5: Linearization Options (sRGB D65 base) ==="

linearizations=(
    "8bit_sRGB"
    "8bit_sRGB_invert"
    "16bit_sRGB"
    "16bit_sRGB_invert"
    "8bit_gamma1.8"
    "8bit_gamma1.8_invert"
    "8bit_gamma2.0"
    "8bit_gamma2.0_invert"
    "8bit_gamma2.2"
    "8bit_gamma2.2_invert"
    "8bit_gamma2.4"
    "8bit_gamma2.4_invert"
)

for lin in "${linearizations[@]}"; do
    name="sRGB_D65_lin_${lin}"
    run_test "$name" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin"
done

# ========================================
# SECTION 6: Linearization + Colorimetric Reference Output
# ========================================
echo ""
echo "=== SECTION 6: Linearization + Colorimetric Output ==="

for lin in "${linearizations[@]}"; do
    name="sRGB_D65_lin_${lin}_output"
    run_test "$name" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin --colorimetric-reference output"
done

# ========================================
# SECTION 7: Linearization + Colorimetric Reference Scene
# ========================================
echo ""
echo "=== SECTION 7: Linearization + Colorimetric Scene ==="

for lin in "${linearizations[@]}"; do
    name="sRGB_D65_lin_${lin}_scene"
    run_test "$name" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin --colorimetric-reference scene"
done

# ========================================
# SECTION 8: Different matrices with key linearizations
# ========================================
echo ""
echo "=== SECTION 8: Different Matrices with Linearization ==="

key_lins=("8bit_sRGB" "8bit_sRGB_invert" "8bit_gamma2.2" "8bit_gamma2.2_invert")

for matrix in "XYZ_sRGB_D50" "XYZ_AdobeRGB_D65" "XYZ_AdobeRGB_D50"; do
    for lin in "${key_lins[@]}"; do
        # Match illuminant to matrix
        if [[ "$matrix" == *"D50"* ]]; then
            illum="D50"
        else
            illum="D65"
        fi
        name="${matrix}_lin_${lin}"
        run_test "$name" "--matrix1 $matrix --illuminant1 $illum --linearization $lin"
    done
done

# ========================================
# SECTION 9: White Balance variations
# ========================================
echo ""
echo "=== SECTION 9: White Balance Variations ==="

wb_values=("1.0,1.0,1.0" "0.9,1.0,1.1" "1.1,1.0,0.9" "1.0,1.0,1.2" "1.2,1.0,1.0")

for wb in "${wb_values[@]}"; do
    wb_name=$(echo "$wb" | tr ',' '_')
    run_test "sRGB_D65_wb_${wb_name}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --wb $wb"
    run_test "sRGB_D65_output_wb_${wb_name}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --colorimetric-reference output --wb $wb"
done

# With linearization
for wb in "1.0,1.0,1.0"; do
    wb_name=$(echo "$wb" | tr ',' '_')
    for lin in "8bit_sRGB" "8bit_sRGB_invert"; do
        run_test "sRGB_D65_lin_${lin}_wb_${wb_name}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin --wb $wb"
        run_test "sRGB_D65_lin_${lin}_output_wb_${wb_name}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin --colorimetric-reference output --wb $wb"
    done
done

# ========================================
# SECTION 10: White-XY variations
# ========================================
echo ""
echo "=== SECTION 10: White-XY Variations ==="

for whitexy in "D50" "D65"; do
    run_test "sRGB_D65_whitexy_${whitexy}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy $whitexy"
    run_test "sRGB_D65_output_whitexy_${whitexy}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --colorimetric-reference output --white-xy $whitexy"
    run_test "sRGB_D50_whitexy_${whitexy}" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --white-xy $whitexy"
    run_test "sRGB_D50_output_whitexy_${whitexy}" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --colorimetric-reference output --white-xy $whitexy"
done

# With linearization
for whitexy in "D50" "D65"; do
    for lin in "8bit_sRGB" "8bit_sRGB_invert"; do
        run_test "sRGB_D65_lin_${lin}_whitexy_${whitexy}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin --white-xy $whitexy"
        run_test "sRGB_D65_lin_${lin}_output_whitexy_${whitexy}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin --colorimetric-reference output --white-xy $whitexy"
    done
done

# ========================================
# SECTION 11: DNG Version variations
# ========================================
echo ""
echo "=== SECTION 11: DNG Version Variations ==="

for version in "1.0" "1.1" "1.2" "1.3" "1.4" "1.5" "1.6"; do
    run_test "sRGB_D65_dng${version}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --dng-backward-version $version"
    run_test "sRGB_D65_output_dng${version}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --colorimetric-reference output --dng-backward-version $version"
done

# ========================================
# SECTION 12: Dual illuminant / matrix
# ========================================
echo ""
echo "=== SECTION 12: Dual Matrix/Illuminant ==="

run_test "dual_sRGB_D50_D65" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --matrix2 XYZ_sRGB_D65 --illuminant2 D65"
run_test "dual_sRGB_D50_D65_output" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --matrix2 XYZ_sRGB_D65 --illuminant2 D65 --colorimetric-reference output"
run_test "dual_sRGB_A_D65" "--matrix1 XYZ_sRGB_D65 --illuminant1 A --matrix2 XYZ_sRGB_D65 --illuminant2 D65"
run_test "dual_sRGB_A_D65_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 A --matrix2 XYZ_sRGB_D65 --illuminant2 D65 --colorimetric-reference output"

# ========================================
# SECTION 13: Combined options (comprehensive)
# ========================================
echo ""
echo "=== SECTION 13: Combined Options ==="

# Best candidate combinations based on sRGB spec
run_test "combo_sRGB_D65_lin_output_wb_whitexy" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB --colorimetric-reference output --wb 1.0,1.0,1.0 --white-xy D65"
run_test "combo_sRGB_D65_lininv_output_wb_whitexy" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization 8bit_sRGB_invert --colorimetric-reference output --wb 1.0,1.0,1.0 --white-xy D65"
run_test "combo_sRGB_D50_lin_output_wb_whitexy50" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --linearization 8bit_sRGB --colorimetric-reference output --wb 1.0,1.0,1.0 --white-xy D50"
run_test "combo_sRGB_D50_lin_output_wb_whitexy65" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --linearization 8bit_sRGB --colorimetric-reference output --wb 1.0,1.0,1.0 --white-xy D65"

run_test "combo_identity_D65_output" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 D65 --colorimetric-reference output"
run_test "combo_identity_D65_lin_output" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 D65 --linearization 8bit_sRGB --colorimetric-reference output"
run_test "combo_identity_D65_lininv_output" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 D65 --linearization 8bit_sRGB_invert --colorimetric-reference output"
run_test "combo_identity_D65_gamma22_output" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 D65 --linearization 8bit_gamma2.2 --colorimetric-reference output"
run_test "combo_identity_D65_gamma22inv_output" "--matrix1 1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0 --illuminant1 D65 --linearization 8bit_gamma2.2_invert --colorimetric-reference output"

# ========================================
# SECTION 14: sRGB D50 with all linearizations
# ========================================
echo ""
echo "=== SECTION 14: sRGB D50 + All Linearizations ==="

for lin in "${linearizations[@]}"; do
    name="sRGB_D50_lin_${lin}"
    run_test "$name" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --linearization $lin"
    run_test "${name}_output" "--matrix1 XYZ_sRGB_D50 --illuminant1 D50 --linearization $lin --colorimetric-reference output"
done

# ========================================
# SECTION 15: AdobeRGB with all linearizations
# ========================================
echo ""
echo "=== SECTION 15: AdobeRGB D65 + All Linearizations ==="

for lin in "${linearizations[@]}"; do
    name="AdobeRGB_D65_lin_${lin}"
    run_test "$name" "--matrix1 XYZ_AdobeRGB_D65 --illuminant1 D65 --linearization $lin"
    run_test "${name}_output" "--matrix1 XYZ_AdobeRGB_D65 --illuminant1 D65 --linearization $lin --colorimetric-reference output"
done

# ========================================
# SECTION 16: 16-bit linearization tests
# ========================================
echo ""
echo "=== SECTION 16: 16-bit Linearization Tests ==="

lins_16bit=("16bit_sRGB" "16bit_sRGB_invert" "16bit_gamma1.8" "16bit_gamma1.8_invert" "16bit_gamma2.0" "16bit_gamma2.0_invert" "16bit_gamma2.2" "16bit_gamma2.2_invert" "16bit_gamma2.4" "16bit_gamma2.4_invert")

for lin in "${lins_16bit[@]}"; do
    run_test "sRGB_D65_${lin}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin"
    run_test "sRGB_D65_${lin}_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --linearization $lin --colorimetric-reference output"
done

# ========================================
# SECTION 17: Illuminant A, B, C tests
# ========================================
echo ""
echo "=== SECTION 17: Non-daylight Illuminants ==="

for illum in "A" "B" "C" "Unknown"; do
    run_test "sRGB_D65_illum_${illum}" "--matrix1 XYZ_sRGB_D65 --illuminant1 $illum"
    run_test "sRGB_D65_illum_${illum}_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 $illum --colorimetric-reference output"
    run_test "sRGB_D65_illum_${illum}_lin_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 $illum --linearization 8bit_sRGB --colorimetric-reference output"
done

# ========================================
# SECTION 18: Custom white-xy values
# ========================================
echo ""
echo "=== SECTION 18: Custom White-XY ==="

# D65 white point: 0.31272, 0.32903
# D50 white point: 0.34567, 0.35850
custom_whitexy=("0.31272,0.32903" "0.34567,0.35850" "0.33333,0.33333")

for xy in "${custom_whitexy[@]}"; do
    xy_name=$(echo "$xy" | tr ',' '_' | tr '.' 'p')
    run_test "sRGB_D65_customxy_${xy_name}" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy $xy"
    run_test "sRGB_D65_customxy_${xy_name}_output" "--matrix1 XYZ_sRGB_D65 --illuminant1 D65 --white-xy $xy --colorimetric-reference output"
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
echo ""
echo "Tip: Sort by name to group similar tests together"
