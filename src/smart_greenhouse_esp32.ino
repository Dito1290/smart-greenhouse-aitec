/*
 * SMART GREENHOUSE IoT - ESP32 Firmware
 * 
 * Project: AITeC (Agricultural Innovation Technology Competition)
 * Category: Smart and Precision Farming
 * 
 * Hardware:
 * - Mikrokontroler: ESP32 DevKit v1 (30-pin)
 * - Sensor: SHT31 (Temp/Humidity), Capacitive Soil Moisture, BH1750 (Light)
 * - Aktuator: Water Pump, Exhaust Fan, LED Grow Light via 4-ch Relay
 * 
 * Features:
 * - Real-time environmental monitoring
 * - Automated irrigation & climate control
 * - MQTT communication to cloud dashboard
 * - Remote control via MQTT commands
 * - Hysteresis-based control to prevent rapid cycling
 * 
 * Author: [Your Name/Team]
 * Version: 1.0.0
 * Date: 2026-09-29
 */

// ============================================================================
// LIBRARY INCLUDES
// ============================================================================
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <BH1750.h>
#include <ArduinoJson.h>

// ============================================================================
// CONFIGURATION - WiFi & MQTT
// ============================================================================
// TODO: Ganti dengan kredensial WiFi dan MQTT broker Anda
const char* WIFI_SSID = "YourWiFiSSID";
const char* WIFI_PASSWORD = "YourWiFiPassword";

const char* MQTT_BROKER = "broker.example.com";  // atau IP address
const int MQTT_PORT = 1883;
const char* MQTT_USER = "greenhouse_user";
const char* MQTT_PASSWORD = "secure_password";
const char* DEVICE_ID = "greenhouse_001";

// ============================================================================
// PIN DEFINITIONS
// ============================================================================
// I2C Pins (default untuk ESP32)
#define I2C_SDA 21
#define I2C_SCL 22

// Analog Input
#define SOIL_MOISTURE_PIN 34    // ADC1_CH6 (GPIO34)

// Relay Control Pins (Active LOW untuk most relay modules)
#define RELAY_PUMP 25           // GPIO25 - Water Pump
#define RELAY_FAN 26            // GPIO26 - Exhaust Fan
#define RELAY_LIGHT 27          // GPIO27 - LED Grow Light
#define RELAY_SPARE 14          // GPIO14 - Spare relay

// ============================================================================
// CONTROL THRESHOLDS & PARAMETERS
// ============================================================================
// Temperature Control (°C)
float TEMP_MAX = 32.0;          // Fan ON jika suhu > TEMP_MAX
float TEMP_MIN = 28.0;          // Fan OFF jika suhu < TEMP_MIN (hysteresis)

// Humidity Control (%)
float HUMIDITY_MAX = 85.0;      // Fan ON jika RH > HUMIDITY_MAX
float HUMIDITY_MIN = 75.0;      // Fan OFF jika RH < HUMIDITY_MIN

// Soil Moisture Control (%)
float SOIL_MOISTURE_MIN = 65.0; // Pump ON jika soil moisture < MIN
float SOIL_MOISTURE_MAX = 75.0; // Pump OFF jika soil moisture > MAX

// Light Intensity Control (lux)
int LIGHT_THRESHOLD = 10000;    // Grow light ON jika lux < threshold
                                 // (hanya untuk supplemental lighting mode)

// Timing Parameters (milliseconds)
unsigned long SENSOR_READ_INTERVAL = 5000;      // Baca sensor setiap 5 detik
unsigned long MQTT_PUBLISH_INTERVAL = 10000;    // Publish ke MQTT setiap 10 detik
unsigned long MIN_PUMP_ON_TIME = 30000;         // Minimum pump ON duration (30s)
unsigned long MIN_PUMP_OFF_TIME = 60000;        // Minimum pump OFF duration (60s)

// Soil Moisture Calibration Values (ADC raw values)
// TODO: Kalibrasi dengan cara:
// 1. Ukur ADC saat sensor di udara (kering) → ADC_DRY
// 2. Ukur ADC saat sensor di air (basah) → ADC_WET
int ADC_DRY = 3200;   // Example value untuk sensor di udara
int ADC_WET = 1400;   // Example value untuk sensor di air

// ============================================================================
// GLOBAL OBJECTS & VARIABLES
// ============================================================================
// Sensor objects
Adafruit_SHT31 sht31 = Adafruit_SHT31();
BH1750 lightMeter;

// WiFi and MQTT clients
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Sensor readings
float temperature = 0.0;
float humidity = 0.0;
float soilMoisture = 0.0;
uint16_t lightIntensity = 0;

// Actuator states (true = ON, false = OFF)
bool pumpState = false;
bool fanState = false;
bool lightState = false;

// Control modes (true = AUTO, false = MANUAL)
bool pumpAutoMode = true;
bool fanAutoMode = true;
bool lightAutoMode = false;  // Default OFF untuk supplemental light

// Timing variables
unsigned long lastSensorRead = 0;
unsigned long lastMqttPublish = 0;
unsigned long pumpLastChangeTime = 0;

// MQTT Topics
String topicSensorData;
String topicActuatorState;
String topicStatus;
String topicCommandPump;
String topicCommandFan;
String topicCommandLight;

// ============================================================================
// SETUP FUNCTION
// ============================================================================
void setup() {
  // Serial communication for debugging
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n===========================================");
  Serial.println("SMART GREENHOUSE IoT - ESP32 Firmware");
  Serial.println("===========================================\n");

  // Initialize GPIO pins
  initializeGPIO();

  // Initialize I2C bus
  Wire.begin(I2C_SDA, I2C_SCL);
  
  // Initialize sensors
  initializeSensors();

  // Connect to WiFi
  connectWiFi();

  // Setup MQTT
  setupMQTT();

  // Initial sensor reading
  readAllSensors();

  Serial.println("\n=== System Ready ===\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected! Reconnecting...");
    connectWiFi();
  }

  unsigned long currentMillis = millis();

  // Read sensors at defined interval
  if (currentMillis - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = currentMillis;
    readAllSensors();
    
    // Execute control logic (only in AUTO mode)
    if (pumpAutoMode || fanAutoMode || lightAutoMode) {
      executeControlLogic();
    }
  }

  // Publish data to MQTT at defined interval
  if (currentMillis - lastMqttPublish >= MQTT_PUBLISH_INTERVAL) {
    lastMqttPublish = currentMillis;
    publishSensorData();
    publishActuatorState();
  }
}

// ============================================================================
// GPIO INITIALIZATION
// ============================================================================
void initializeGPIO() {
  Serial.println("Initializing GPIO pins...");
  
  // Set relay pins as outputs
  pinMode(RELAY_PUMP, OUTPUT);
  pinMode(RELAY_FAN, OUTPUT);
  pinMode(RELAY_LIGHT, OUTPUT);
  pinMode(RELAY_SPARE, OUTPUT);

  // Initialize all relays to OFF (HIGH = OFF untuk active-LOW relay)
  digitalWrite(RELAY_PUMP, HIGH);
  digitalWrite(RELAY_FAN, HIGH);
  digitalWrite(RELAY_LIGHT, HIGH);
  digitalWrite(RELAY_SPARE, HIGH);

  // Soil moisture sensor pin (analog input, no pinMode needed)
  
  Serial.println("✓ GPIO initialized");
}

// ============================================================================
// SENSOR INITIALIZATION
// ============================================================================
void initializeSensors() {
  Serial.println("Initializing sensors...");

  // Initialize SHT31
  if (!sht31.begin(0x44)) {  // 0x44 is default I2C address for SHT31
    Serial.println("✗ SHT31 sensor not found! Check wiring.");
  } else {
    Serial.println("✓ SHT31 temperature/humidity sensor ready");
  }

  // Initialize BH1750
  if (!lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("✗ BH1750 sensor not found! Check wiring.");
  } else {
    Serial.println("✓ BH1750 light sensor ready");
  }
}

// ============================================================================
// WiFi CONNECTION
// ============================================================================
void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("\n✗ WiFi connection failed!");
  }
}

// ============================================================================
// MQTT SETUP & CONNECTION
// ============================================================================
void setupMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  // Build topic strings dengan device ID
  topicSensorData = String("greenhouse/") + DEVICE_ID + "/sensors";
  topicActuatorState = String("greenhouse/") + DEVICE_ID + "/actuators";
  topicStatus = String("greenhouse/") + DEVICE_ID + "/status";
  topicCommandPump = String("greenhouse/") + DEVICE_ID + "/commands/pump";
  topicCommandFan = String("greenhouse/") + DEVICE_ID + "/commands/fan";
  topicCommandLight = String("greenhouse/") + DEVICE_ID + "/commands/light";
}

void reconnectMQTT() {
  int attempts = 0;
  while (!mqttClient.connected() && attempts < 5) {
    Serial.print("Connecting to MQTT broker...");
    
    String clientId = String("ESP32_") + DEVICE_ID;
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)) {
      Serial.println(" connected!");
      
      // Subscribe to command topics
      mqttClient.subscribe(topicCommandPump.c_str());
      mqttClient.subscribe(topicCommandFan.c_str());
      mqttClient.subscribe(topicCommandLight.c_str());
      
      Serial.println("✓ Subscribed to command topics");
      
      // Publish online status
      mqttClient.publish(topicStatus.c_str(), "online", true);
      
    } else {
      Serial.print(" failed, rc=");
      Serial.println(mqttClient.state());
      delay(2000);
      attempts++;
    }
  }
}

// ============================================================================
// MQTT CALLBACK - Handle incoming commands
// ============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  String message = "";
  
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("MQTT message received [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  // Parse commands
  if (topicStr == topicCommandPump) {
    handlePumpCommand(message);
  } else if (topicStr == topicCommandFan) {
    handleFanCommand(message);
  } else if (topicStr == topicCommandLight) {
    handleLightCommand(message);
  }
}

void handlePumpCommand(String command) {
  if (command == "ON") {
    pumpAutoMode = false;
    setPumpState(true);
    Serial.println("→ Pump: MANUAL ON");
  } else if (command == "OFF") {
    pumpAutoMode = false;
    setPumpState(false);
    Serial.println("→ Pump: MANUAL OFF");
  } else if (command == "AUTO") {
    pumpAutoMode = true;
    Serial.println("→ Pump: AUTO mode enabled");
  }
}

void handleFanCommand(String command) {
  if (command == "ON") {
    fanAutoMode = false;
    setFanState(true);
    Serial.println("→ Fan: MANUAL ON");
  } else if (command == "OFF") {
    fanAutoMode = false;
    setFanState(false);
    Serial.println("→ Fan: MANUAL OFF");
  } else if (command == "AUTO") {
    fanAutoMode = true;
    Serial.println("→ Fan: AUTO mode enabled");
  }
}

void handleLightCommand(String command) {
  if (command == "ON") {
    lightAutoMode = false;
    setLightState(true);
    Serial.println("→ Light: MANUAL ON");
  } else if (command == "OFF") {
    lightAutoMode = false;
    setLightState(false);
    Serial.println("→ Light: MANUAL OFF");
  } else if (command == "AUTO") {
    lightAutoMode = true;
    Serial.println("→ Light: AUTO mode enabled");
  }
}

// ============================================================================
// SENSOR READING FUNCTIONS
// ============================================================================
void readAllSensors() {
  // Read SHT31 (Temperature & Humidity)
  temperature = sht31.readTemperature();
  humidity = sht31.readHumidity();

  // Validate SHT31 readings
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("✗ Error reading SHT31 sensor!");
    // Keep previous valid values atau set to safe defaults
  }

  // Read soil moisture (capacitive sensor)
  soilMoisture = readSoilMoisture();

  // Read light intensity (BH1750)
  lightIntensity = lightMeter.readLightLevel();

  // Print sensor readings to Serial
  printSensorReadings();
}

float readSoilMoisture() {
  // Read ADC value (0-4095 untuk 12-bit ADC ESP32)
  int adcValue = analogRead(SOIL_MOISTURE_PIN);
  
  // Konversi ADC ke percentage (0-100%)
  // Mapping: ADC_WET (basah) = 100%, ADC_DRY (kering) = 0%
  float moisture = map(adcValue, ADC_WET, ADC_DRY, 100, 0);
  
  // Constrain to 0-100%
  moisture = constrain(moisture, 0, 100);
  
  return moisture;
}

void printSensorReadings() {
  Serial.println("\n--- Sensor Readings ---");
  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.println(" °C");
  
  Serial.print("Humidity: ");
  Serial.print(humidity);
  Serial.println(" %");
  
  Serial.print("Soil Moisture: ");
  Serial.print(soilMoisture);
  Serial.println(" %");
  
  Serial.print("Light Intensity: ");
  Serial.print(lightIntensity);
  Serial.println(" lux");
  Serial.println("-----------------------\n");
}

// ============================================================================
// CONTROL LOGIC - Automated Control
// ============================================================================
void executeControlLogic() {
  unsigned long currentMillis = millis();

  // === IRRIGATION CONTROL (Pump) ===
  if (pumpAutoMode) {
    // Hysteresis control untuk prevent rapid cycling
    if (soilMoisture < SOIL_MOISTURE_MIN) {
      // Soil terlalu kering, aktifkan pump
      // Tapi cek minimum OFF time untuk protect pump
      if (!pumpState && (currentMillis - pumpLastChangeTime >= MIN_PUMP_OFF_TIME)) {
        setPumpState(true);
        Serial.println("🌊 AUTO: Pump ON (soil moisture low)");
      }
    } else if (soilMoisture > SOIL_MOISTURE_MAX) {
      // Soil cukup basah, matikan pump
      // Cek minimum ON time untuk ensure adequate watering
      if (pumpState && (currentMillis - pumpLastChangeTime >= MIN_PUMP_ON_TIME)) {
        setPumpState(false);
        Serial.println("🌊 AUTO: Pump OFF (soil moisture adequate)");
      }
    }
    // Jika dalam hysteresis band (SOIL_MOISTURE_MIN < x < SOIL_MOISTURE_MAX),
    // maintain current state (no change)
  }

  // === CLIMATE CONTROL (Fan) ===
  if (fanAutoMode) {
    // Fan ON jika temperature ATAU humidity terlalu tinggi
    bool shouldFanOn = (temperature > TEMP_MAX) || (humidity > HUMIDITY_MAX);
    bool shouldFanOff = (temperature < TEMP_MIN) && (humidity < HUMIDITY_MIN);

    if (shouldFanOn && !fanState) {
      setFanState(true);
      Serial.print("🌀 AUTO: Fan ON (");
      if (temperature > TEMP_MAX) Serial.print("temp high");
      if (humidity > HUMIDITY_MAX) Serial.print(" humidity high");
      Serial.println(")");
    } else if (shouldFanOff && fanState) {
      setFanState(false);
      Serial.println("🌀 AUTO: Fan OFF (conditions normal)");
    }
  }

  // === SUPPLEMENTAL LIGHTING CONTROL ===
  if (lightAutoMode) {
    // Light ON jika intensitas cahaya alami terlalu rendah
    if (lightIntensity < LIGHT_THRESHOLD && !lightState) {
      setLightState(true);
      Serial.println("💡 AUTO: Grow light ON (low natural light)");
    } else if (lightIntensity >= LIGHT_THRESHOLD && lightState) {
      setLightState(false);
      Serial.println("💡 AUTO: Grow light OFF (sufficient natural light)");
    }
  }
}

// ============================================================================
// ACTUATOR CONTROL FUNCTIONS
// ============================================================================
void setPumpState(bool state) {
  pumpState = state;
  digitalWrite(RELAY_PUMP, state ? LOW : HIGH);  // LOW = ON (active-low relay)
  pumpLastChangeTime = millis();
}

void setFanState(bool state) {
  fanState = state;
  digitalWrite(RELAY_FAN, state ? LOW : HIGH);
}

void setLightState(bool state) {
  lightState = state;
  digitalWrite(RELAY_LIGHT, state ? LOW : HIGH);
}

// ============================================================================
// MQTT PUBLISH FUNCTIONS
// ============================================================================
void publishSensorData() {
  // Create JSON document
  StaticJsonDocument<256> doc;
  
  doc["device_id"] = DEVICE_ID;
  doc["timestamp"] = millis() / 1000;  // Unix timestamp (seconds)
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["soil_moisture"] = soilMoisture;
  doc["light_intensity"] = lightIntensity;
  doc["rssi"] = WiFi.RSSI();

  // Serialize JSON to string
  char jsonBuffer[256];
  serializeJson(doc, jsonBuffer);

  // Publish to MQTT
  if (mqttClient.publish(topicSensorData.c_str(), jsonBuffer)) {
    Serial.println("📡 Sensor data published to MQTT");
  } else {
    Serial.println("✗ Failed to publish sensor data");
  }
}

void publishActuatorState() {
  StaticJsonDocument<128> doc;
  
  doc["device_id"] = DEVICE_ID;
  doc["pump_state"] = pumpState;
  doc["fan_state"] = fanState;
  doc["light_state"] = lightState;
  doc["pump_mode"] = pumpAutoMode ? "AUTO" : "MANUAL";
  doc["fan_mode"] = fanAutoMode ? "AUTO" : "MANUAL";
  doc["light_mode"] = lightAutoMode ? "AUTO" : "MANUAL";

  char jsonBuffer[128];
  serializeJson(doc, jsonBuffer);

  mqttClient.publish(topicActuatorState.c_str(), jsonBuffer);
}

// ============================================================================
// END OF FIRMWARE CODE
// ============================================================================

/*
 * CATATAN DEPLOYMENT:
 * 
 * 1. INSTALASI LIBRARY (via Arduino IDE Library Manager):
 *    - WiFi (built-in ESP32 core)
 *    - PubSubClient by Nick O'Leary
 *    - Adafruit SHT31 Library
 *    - BH1750 by Christopher Laws
 *    - ArduinoJson by Benoit Blanchon (v6.x)
 * 
 * 2. KONFIGURASI:
 *    - Ganti WIFI_SSID dan WIFI_PASSWORD dengan WiFi Anda
 *    - Ganti MQTT_BROKER, MQTT_USER, MQTT_PASSWORD sesuai setup Anda
 *    - Set DEVICE_ID unik untuk setiap greenhouse unit
 * 
 * 3. KALIBRASI SENSOR:
 *    - Soil Moisture: Ukur ADC saat kering (udara) dan basah (air), update
 *      variable ADC_DRY dan ADC_WET
 *    - SHT31 dan BH1750: Umumnya tidak perlu kalibrasi manual (factory calibrated)
 * 
 * 4. UPLOAD & TESTING:
 *    - Pilih board: ESP32 Dev Module
 *    - Upload speed: 921600
 *    - Flash frequency: 80MHz
 *    - Monitor Serial output untuk debugging
 * 
 * 5. TROUBLESHOOTING:
 *    - Jika sensor tidak terdeteksi: Cek wiring I2C (SDA, SCL, VCC, GND)
 *    - Jika MQTT gagal connect: Cek network connectivity, broker address, credentials
 *    - Jika relay tidak bekerja: Cek voltage level (3.3V ESP32 vs 5V relay trigger)
 * 
 * 6. FUTURE ENHANCEMENTS:
 *    - OTA (Over-The-Air) firmware update
 *    - Deep sleep mode untuk battery operation
 *    - SD card logging untuk offline data backup
 *    - Multiple sensor support (array of sensors untuk greenhouse besar)
 *    - PID control untuk precise temperature/humidity regulation
 */
