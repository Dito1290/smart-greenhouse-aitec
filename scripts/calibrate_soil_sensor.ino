/*
 * SOIL MOISTURE SENSOR CALIBRATION TOOL
 * 
 * Purpose: Determine ADC_DRY and ADC_WET values untuk soil moisture sensor
 * 
 * Instructions:
 * 1. Upload sketch ini ke ESP32
 * 2. Open Serial Monitor (115200 baud)
 * 3. Untuk ADC_DRY: Letakkan sensor di udara (kering), tunggu 10 detik, catat nilai
 * 4. Untuk ADC_WET: Celupkan sensor fully submerged di air, tunggu 10 detik, catat nilai
 * 5. Update nilai ADC_DRY dan ADC_WET di firmware utama
 * 
 * Optional: Untuk multi-point calibration, ukur pada berbagai known moisture levels
 */

#define SOIL_MOISTURE_PIN 34  // GPIO34 ADC1_CH6

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n========================================");
  Serial.println("SOIL MOISTURE SENSOR CALIBRATION TOOL");
  Serial.println("========================================\n");
  
  pinMode(SOIL_MOISTURE_PIN, INPUT);
  
  Serial.println("Instructions:");
  Serial.println("1. Place sensor in AIR (dry) and note ADC value → ADC_DRY");
  Serial.println("2. Place sensor in WATER (wet) and note ADC value → ADC_WET");
  Serial.println("3. Update these values in main firmware\n");
  Serial.println("Reading ADC values every 1 second...\n");
}

void loop() {
  // Read ADC value multiple times dan average untuk stability
  int adcSum = 0;
  int numReadings = 10;
  
  for (int i = 0; i < numReadings; i++) {
    adcSum += analogRead(SOIL_MOISTURE_PIN);
    delay(10);
  }
  
  int adcValue = adcSum / numReadings;
  
  // Display current reading
  Serial.print("ADC Value: ");
  Serial.print(adcValue);
  Serial.print("  (Raw: ");
  Serial.print(analogRead(SOIL_MOISTURE_PIN));
  Serial.println(")");
  
  delay(1000);
}

/*
 * EXPECTED RESULTS (typical untuk capacitive sensor):
 * 
 * ADC_DRY (in air):        ~3000-3400
 * ADC_WET (in water):      ~1200-1600
 * 
 * Note: Nilai dapat berbeda tergantung sensor model dan ESP32 unit
 * 
 * MULTI-POINT CALIBRATION (Advanced):
 * 
 * Untuk akurasi lebih tinggi, lakukan gravimetric calibration:
 * 
 * 1. Siapkan sample tanah dengan known volumetric water content:
 *    - 0%: Oven-dry soil (105°C for 24h)
 *    - 25%: Add 25ml water per 100g dry soil
 *    - 50%: Add 50ml water per 100g dry soil
 *    - 75%: Add 75ml water per 100g dry soil
 *    - 100%: Saturated (field capacity)
 * 
 * 2. Measure ADC pada setiap moisture level
 * 
 * 3. Create lookup table atau polynomial fitting:
 *    moisture = a*ADC^2 + b*ADC + c
 * 
 * 4. Implement di firmware untuk non-linear conversion
 */
