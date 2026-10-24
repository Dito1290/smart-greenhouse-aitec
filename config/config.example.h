// ============================================================================
// CONFIG.H - Configuration Template untuk ESP32 Smart Greenhouse
// ============================================================================
// 
// INSTRUCTIONS:
// 1. Copy file ini menjadi config.h di folder src/
// 2. Edit values sesuai setup Anda
// 3. Jangan commit config.h ke Git (add ke .gitignore)
// 4. Gunakan file ini sebagai template untuk team members
//

#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// WiFi CONFIGURATION
// ============================================================================
#define WIFI_SSID "YourWiFiNetworkName"
#define WIFI_PASSWORD "YourWiFiPassword"

// Optional: Static IP configuration (comment out untuk DHCP)
// #define USE_STATIC_IP
// #ifdef USE_STATIC_IP
//   #define STATIC_IP      192, 168, 1, 100
//   #define GATEWAY_IP     192, 168, 1, 1
//   #define SUBNET_MASK    255, 255, 255, 0
//   #define PRIMARY_DNS    8, 8, 8, 8
//   #define SECONDARY_DNS  8, 8, 4, 4
// #endif

// ============================================================================
// MQTT BROKER CONFIGURATION
// ============================================================================
#define MQTT_BROKER "your-mqtt-broker.com"  // IP address atau domain
#define MQTT_PORT 1883                      // 1883 for MQTT, 8883 for MQTTS
#define MQTT_USER "greenhouse_user"
#define MQTT_PASSWORD "your_secure_password"

// Device identification (unique per greenhouse unit)
#define DEVICE_ID "greenhouse_001"

// Optional: MQTT TLS/SSL (jika menggunakan port 8883)
// #define MQTT_USE_TLS
// #ifdef MQTT_USE_TLS
//   // Include CA certificate untuk server verification
//   const char* ca_cert = \
//     "-----BEGIN CERTIFICATE-----\n" \
//     "...\n" \
//     "-----END CERTIFICATE-----\n";
// #endif

// ============================================================================
// PIN CONFIGURATION
// ============================================================================
// I2C Pins
#define I2C_SDA 21
#define I2C_SCL 22

// Analog Input
#define SOIL_MOISTURE_PIN 34

// Relay Control (Active LOW untuk most relay modules)
#define RELAY_PUMP 25
#define RELAY_FAN 26
#define RELAY_LIGHT 27
#define RELAY_SPARE 14

// Optional: Status LED
// #define STATUS_LED 2  // Built-in LED pada ESP32

// ============================================================================
// SENSOR CALIBRATION
// ============================================================================
// Soil Moisture Sensor Calibration (ADC values)
// Run calibrate_soil_sensor.ino untuk determine these values
#define ADC_DRY 3200  // ADC value ketika sensor di udara (0% moisture)
#define ADC_WET 1400  // ADC value ketika sensor di air (100% moisture)

// Temperature offset calibration (jika diperlukan)
// #define TEMP_OFFSET 0.0  // Add this to SHT31 reading

// Humidity offset calibration (jika diperlukan)
// #define HUMIDITY_OFFSET 0.0  // Add this to SHT31 reading

// ============================================================================
// CONTROL THRESHOLDS
// ============================================================================
// Temperature Control (Celsius)
#define TEMP_MAX 32.0   // Fan ON jika temp > TEMP_MAX
#define TEMP_MIN 28.0   // Fan OFF jika temp < TEMP_MIN

// Humidity Control (%)
#define HUMIDITY_MAX 85.0  // Fan ON jika RH > HUMIDITY_MAX
#define HUMIDITY_MIN 75.0  // Fan OFF jika RH < HUMIDITY_MIN

// Soil Moisture Control (%)
#define SOIL_MOISTURE_MIN 65.0  // Pump ON jika moisture < MIN
#define SOIL_MOISTURE_MAX 75.0  // Pump OFF jika moisture > MAX

// Light Intensity Control (lux)
#define LIGHT_THRESHOLD 10000  // Grow light ON jika lux < threshold

// ============================================================================
// TIMING PARAMETERS (milliseconds)
// ============================================================================
#define SENSOR_READ_INTERVAL 5000    // Baca sensor setiap 5 detik
#define MQTT_PUBLISH_INTERVAL 10000  // Publish ke MQTT setiap 10 detik
#define STATUS_PUBLISH_INTERVAL 60000  // Publish status setiap 1 menit

// Actuator protection timings
#define MIN_PUMP_ON_TIME 30000   // Minimum 30 seconds ON
#define MIN_PUMP_OFF_TIME 60000  // Minimum 60 seconds OFF
#define MIN_FAN_OFF_TIME 30000   // Minimum 30 seconds OFF

// ============================================================================
// FEATURE FLAGS
// ============================================================================
// Enable/disable optional features
#define ENABLE_OTA_UPDATE false       // Over-The-Air firmware update
#define ENABLE_SD_LOGGING false       // SD card data logging
#define ENABLE_DISPLAY false          // OLED display support
#define ENABLE_DEEP_SLEEP false       // Deep sleep untuk battery mode

// Debug settings
#define ENABLE_SERIAL_DEBUG true      // Serial output untuk debugging
#define SERIAL_BAUD_RATE 115200

// ============================================================================
// ADVANCED SETTINGS
// ============================================================================
// WiFi connection
#define WIFI_CONNECT_TIMEOUT 20000    // Timeout untuk WiFi connect (ms)
#define WIFI_RECONNECT_INTERVAL 30000 // Interval untuk WiFi reconnect

// MQTT settings
#define MQTT_RECONNECT_INTERVAL 5000  // Interval untuk MQTT reconnect
#define MQTT_KEEPALIVE 60             // MQTT keepalive (seconds)
#define MQTT_QOS 1                    // Quality of Service (0, 1, or 2)

// Watchdog timer (ESP32 built-in)
#define ENABLE_WATCHDOG true
#define WATCHDOG_TIMEOUT 60           // Seconds before reset

// ============================================================================
// CROP-SPECIFIC PROFILES (Optional)
// ============================================================================
// Uncomment one profile atau create custom

// Profile 1: Lettuce / Leafy Greens
// #define CROP_TEMP_MIN 20.0
// #define CROP_TEMP_MAX 26.0
// #define CROP_HUMIDITY_TARGET 70.0
// #define CROP_SOIL_MOISTURE_TARGET 70.0
// #define CROP_DLI_TARGET 14.0  // Daily Light Integral (mol/m²/day)

// Profile 2: Tomato
// #define CROP_TEMP_MIN 22.0
// #define CROP_TEMP_MAX 28.0
// #define CROP_HUMIDITY_TARGET 65.0
// #define CROP_SOIL_MOISTURE_TARGET 65.0
// #define CROP_DLI_TARGET 20.0

// Profile 3: Chili / Pepper
// #define CROP_TEMP_MIN 24.0
// #define CROP_TEMP_MAX 30.0
// #define CROP_HUMIDITY_TARGET 60.0
// #define CROP_SOIL_MOISTURE_TARGET 60.0
// #define CROP_DLI_TARGET 18.0

// ============================================================================
// SAFETY LIMITS (Prevent damage)
// ============================================================================
#define MAX_PUMP_CONTINUOUS_ON_TIME 300000  // 5 minutes max (prevent overflow)
#define MAX_FAN_CONTINUOUS_ON_TIME 3600000  // 1 hour max
#define TEMP_CRITICAL_HIGH 45.0             // Alert jika temp > 45°C
#define TEMP_CRITICAL_LOW 5.0               // Alert jika temp < 5°C
#define HUMIDITY_CRITICAL_HIGH 95.0         // Alert jika RH > 95%

#endif // CONFIG_H
