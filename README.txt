>> AI Greenhouse Companion (aplikasi mobile + backend gateway): lihat COMPANION_SETUP.md
>> Catatan: src/smart_greenhouse_esp32.ino adalah template lama dan BUKAN firmware yang dipakai aplikasi tersebut.

================================================================================
SMART GREENHOUSE IoT PROJECT
AITeC (Agricultural Innovation Technology Competition)
Category: Smart and Precision Farming
================================================================================

PROJECT OVERVIEW
================================================================================

Sistem monitoring dan kontrol otomatis greenhouse berbasis ESP32 dengan 
integrasi IoT untuk optimasi parameter mikroklimat tanaman hortikultura.

Features:
- Real-time monitoring suhu, kelembapan udara, kelembapan tanah, intensitas cahaya
- Automated irrigation berbasis soil moisture sensing
- Automated climate control (exhaust fan) berbasis temperature/humidity
- Optional supplemental lighting control
- Cloud-based data logging dan visualization
- Web dashboard untuk remote monitoring dan control
- MQTT protocol untuk reliable IoT communication


REPOSITORY STRUCTURE
================================================================================

smart-greenhouse-aitec/
│
├── README.txt                      # File ini - project overview
│
├── docs/                           # Dokumentasi proyek
│   ├── proposal-draft.txt          # Draft proposal lengkap untuk AITeC
│   ├── rab-dan-jadwal.txt          # Rencana Anggaran Biaya & Jadwal detail
│   ├── user-manual.txt             # (TO BE CREATED) Panduan pengguna
│   └── technical-report.txt        # (TO BE CREATED) Laporan teknis final
│
├── hardware/                       # Hardware design files
│   ├── architecture.txt            # Arsitektur hardware lengkap
│   ├── schematic.fzz               # (TO BE CREATED) Fritzing schematic
│   ├── wiring-diagram.png          # (TO BE CREATED) Diagram pengkabelan
│   ├── pcb/                        # (OPTIONAL) Custom PCB design files
│   └── bom.csv                     # (TO BE CREATED) Bill of Materials
│
├── src/                            # Source code
│   ├── smart_greenhouse_esp32.ino  # ESP32 firmware (Arduino)
│   ├── libraries/                  # Custom libraries (jika ada)
│   │   └── [custom libraries]
│   └── tests/                      # Unit tests (optional)
│       └── sensor_test.ino
│
├── backend/                        # Cloud backend services
│   ├── package.json                # (TO BE CREATED) Node.js dependencies
│   ├── server.js                   # (TO BE CREATED) Express.js API server
│   ├── mqtt-subscriber.js          # (TO BE CREATED) MQTT data ingestion
│   ├── routes/                     # API route handlers
│   │   ├── devices.js
│   │   ├── sensors.js
│   │   └── commands.js
│   ├── models/                     # Database models
│   │   └── SensorData.js
│   ├── config/                     # Configuration files
│   │   ├── database.js
│   │   └── mqtt.js
│   └── README.md                   # Backend setup instructions
│
├── frontend/                       # Web dashboard
│   ├── package.json                # (TO BE CREATED) React dependencies
│   ├── public/                     # Static assets
│   │   └── index.html
│   ├── src/                        # React components
│   │   ├── App.js
│   │   ├── components/
│   │   │   ├── Dashboard.js
│   │   │   ├── SensorChart.js
│   │   │   ├── ControlPanel.js
│   │   │   └── StatusCard.js
│   │   ├── services/
│   │   │   ├── api.js              # API client
│   │   │   └── mqtt.js             # MQTT WebSocket client
│   │   └── utils/
│   └── README.md                   # Frontend setup instructions
│
├── data/                           # Data files (collected during testing)
│   ├── calibration/                # Sensor calibration data
│   │   ├── soil_moisture_cal.csv
│   │   └── temp_humidity_cal.csv
│   ├── test-results/               # Testing & validation data
│   │   ├── week7_continuous_log.csv
│   │   └── performance_metrics.xlsx
│   └── analysis/                   # Data analysis scripts
│       └── analyze_greenhouse_data.py
│
├── config/                         # Configuration templates
│   ├── config.example.h            # ESP32 config template (WiFi, MQTT)
│   ├── backend.env.example         # Backend environment variables
│   └── mosquitto.conf              # MQTT broker configuration
│
├── scripts/                        # Utility scripts
│   ├── calibrate_soil_sensor.ino   # Soil moisture calibration tool
│   ├── mqtt_test_client.py         # MQTT testing script
│   └── deploy_backend.sh           # Backend deployment script
│
├── media/                          # Images, videos, presentations
│   ├── photos/                     # Foto hardware & instalasi
│   ├── screenshots/                # Dashboard screenshots
│   ├── video/                      # Video demonstrasi
│   │   └── demo_final.mp4
│   └── presentation/               # Presentation materials
│       ├── slides.pptx
│       └── poster.pdf
│
└── references/                     # Reference materials
    ├── datasheets/                 # Component datasheets
    │   ├── ESP32_datasheet.pdf
    │   ├── SHT31_datasheet.pdf
    │   ├── BH1750_datasheet.pdf
    │   └── soil_moisture_sensor.pdf
    ├── papers/                     # Academic papers & literature
    └── standards/                  # Standards & guidelines


HARDWARE COMPONENTS
================================================================================

Core Controller:
- ESP32 DevKit v1 (30-pin) - Dual-core 240MHz, WiFi, Bluetooth

Sensors:
- SHT31 (I2C) - Temperature & Humidity (±0.2°C, ±2% RH)
- Capacitive Soil Moisture Sensor (Analog) - Kelembapan tanah
- BH1750 (I2C) - Light intensity (1-65535 lux)

Actuators:
- 4-Channel Relay Module (5V) - Switching controller
- Water Pump DC 12V 5L/min - Automated irrigation
- Exhaust Fan DC 12V - Climate control
- LED Grow Light 12V 15W (optional) - Supplemental lighting

Power System:
- Power Supply 12V 3A
- Step-Down Converter 12V→5V 3A (LM2596)

Enclosure:
- Junction Box IP55 200x150x75mm
- Waterproof cable glands
- Mounting hardware


SOFTWARE STACK
================================================================================

Firmware (ESP32):
- Platform: Arduino Framework
- Language: C/C++
- Libraries:
  * WiFi.h - WiFi connectivity
  * PubSubClient.h - MQTT client
  * Wire.h - I2C communication
  * Adafruit_SHT31.h - Temperature/humidity sensor
  * BH1750.h - Light sensor
  * ArduinoJson.h - JSON parsing

Backend (Cloud Server):
- Platform: Node.js 18.x
- Framework: Express.js
- MQTT Broker: Eclipse Mosquitto 2.x
- Database: InfluxDB 2.x (time-series) atau MongoDB
- Process Manager: PM2
- Authentication: JWT (JSON Web Token)

Frontend (Web Dashboard):
- Framework: React.js 18
- Language: JavaScript / TypeScript
- Charting: Chart.js atau Recharts
- State Management: React Context API
- UI Components: Material-UI atau Ant Design
- Real-time: MQTT.js (WebSocket)


GETTING STARTED - QUICK START GUIDE
================================================================================

1. HARDWARE SETUP

   a. Assemble hardware sesuai wiring diagram di hardware/wiring-diagram.png
   b. Connect sensors ke ESP32:
      - SHT31: SDA→GPIO21, SCL→GPIO22, VCC→3.3V, GND→GND
      - BH1750: SDA→GPIO21, SCL→GPIO22 (parallel), VCC→3.3V, GND→GND
      - Soil Moisture: VCC→3.3V, GND→GND, AOUT→GPIO34
   c. Connect relays ke ESP32:
      - Relay 1 (Pump): IN1→GPIO25
      - Relay 2 (Fan): IN2→GPIO26
      - Relay 3 (Light): IN3→GPIO27
   d. Connect actuators ke relay NO (Normally Open) terminals
   e. Power system: 12V adaptor → step-down → 5V to ESP32


2. FIRMWARE SETUP (ESP32)

   a. Install Arduino IDE (https://www.arduino.cc/en/software)
   
   b. Install ESP32 board support:
      - File → Preferences → Additional Board Manager URLs:
        https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
      - Tools → Board → Boards Manager → Search "ESP32" → Install
   
   c. Install required libraries via Library Manager:
      - PubSubClient (by Nick O'Leary)
      - Adafruit SHT31 Library
      - BH1750 (by Christopher Laws)
      - ArduinoJson (v6.x by Benoit Blanchon)
   
   d. Configure firmware:
      - Open src/smart_greenhouse_esp32.ino
      - Edit WiFi credentials (WIFI_SSID, WIFI_PASSWORD)
      - Edit MQTT broker settings (MQTT_BROKER, MQTT_USER, MQTT_PASSWORD)
      - Set unique DEVICE_ID
   
   e. Upload to ESP32:
      - Select board: ESP32 Dev Module
      - Select port: (auto-detect atau check di Device Manager)
      - Click Upload
      - Monitor Serial output untuk verify connection


3. BACKEND SETUP (Cloud Server)

   a. Setup VPS server (Ubuntu 22.04 LTS recommended)
   
   b. Install dependencies:
      sudo apt update && sudo apt upgrade -y
      sudo apt install nodejs npm mosquitto mosquitto-clients influxdb
   
   c. Configure Mosquitto MQTT broker:
      - Edit /etc/mosquitto/mosquitto.conf
      - Add authentication (atau use config/mosquitto.conf template)
      - Restart: sudo systemctl restart mosquitto
   
   d. Setup backend application:
      cd backend/
      npm install
      cp backend.env.example .env
      nano .env  # Edit configuration
      npm start  # Atau use PM2: pm2 start server.js
   
   e. Test API:
      curl http://your-server-ip:3000/api/health


4. FRONTEND SETUP (Dashboard)

   a. Development mode (local):
      cd frontend/
      npm install
      npm start  # Runs on http://localhost:3000
   
   b. Production build:
      npm run build
      # Deploy build/ folder to Netlify/Vercel atau serve via Nginx


5. TESTING & VALIDATION

   a. Check sensor readings di Serial Monitor
   b. Verify MQTT messages dengan MQTT Explorer tool
   c. Access dashboard dan check real-time data update
   d. Test manual control commands dari dashboard
   e. Test AUTO mode control logic


CONFIGURATION & CUSTOMIZATION
================================================================================

Control Thresholds (edit in firmware source code):

Temperature Control:
- TEMP_MAX = 32.0°C  (Fan ON threshold)
- TEMP_MIN = 28.0°C  (Fan OFF threshold - hysteresis)

Humidity Control:
- HUMIDITY_MAX = 85.0%  (Fan ON threshold)
- HUMIDITY_MIN = 75.0%  (Fan OFF threshold)

Soil Moisture Control:
- SOIL_MOISTURE_MIN = 65.0%  (Pump ON threshold)
- SOIL_MOISTURE_MAX = 75.0%  (Pump OFF threshold)

Light Intensity:
- LIGHT_THRESHOLD = 10000 lux  (Grow light ON if below)

Timing Parameters:
- SENSOR_READ_INTERVAL = 5000 ms  (5 seconds)
- MQTT_PUBLISH_INTERVAL = 10000 ms  (10 seconds)
- MIN_PUMP_ON_TIME = 30000 ms  (30 seconds minimum)
- MIN_PUMP_OFF_TIME = 60000 ms  (60 seconds minimum)


SENSOR CALIBRATION
================================================================================

Soil Moisture Sensor Calibration:

1. Measure ADC value saat sensor di udara (kering):
   - Upload scripts/calibrate_soil_sensor.ino
   - Record ADC_DRY value (typically ~3200 untuk capacitive sensor)

2. Measure ADC value saat sensor fully submerged di air (basah):
   - Record ADC_WET value (typically ~1400)

3. Update firmware dengan calibration values:
   int ADC_DRY = [your measured value];
   int ADC_WET = [your measured value];

4. (Optional) Multi-point calibration untuk better accuracy:
   - Measure ADC pada known volumetric water content (gravimetric method)
   - Create lookup table atau polynomial fitting


MQTT TOPICS REFERENCE
================================================================================

ESP32 → Cloud (PUBLISH):
- greenhouse/[device_id]/sensors          → All sensor data (JSON)
- greenhouse/[device_id]/actuators        → Actuator states (JSON)
- greenhouse/[device_id]/status           → System status (online/offline)

Cloud → ESP32 (SUBSCRIBE):
- greenhouse/[device_id]/commands/pump    → Pump control ("ON"|"OFF"|"AUTO")
- greenhouse/[device_id]/commands/fan     → Fan control
- greenhouse/[device_id]/commands/light   → Light control


TROUBLESHOOTING
================================================================================

Problem: ESP32 tidak connect ke WiFi
Solution:
- Verify SSID dan password correct (case-sensitive)
- Check WiFi 2.4GHz (ESP32 tidak support 5GHz)
- Try static IP jika DHCP bermasalah
- Check signal strength dengan WiFi.RSSI()

Problem: Sensor not detected (I2C)
Solution:
- Verify wiring: SDA, SCL, VCC, GND
- Run I2C scanner sketch untuk detect address
- Check pull-up resistors pada I2C bus (4.7kΩ biasanya sudah ada di module)
- Try different I2C speed (Wire.setClock(100000))

Problem: Relay tidak switching
Solution:
- Check relay trigger type (active-LOW atau active-HIGH)
- Verify GPIO voltage (3.3V ESP32 vs 5V relay trigger)
- Test relay manual dengan jumper wire ke VCC/GND
- Use level shifter jika voltage mismatch

Problem: MQTT connection failed
Solution:
- Verify broker address (IP atau domain) reachable
- Check port (default 1883 untuk MQTT, 8883 untuk MQTTS)
- Verify username/password authentication
- Check firewall rules di server
- Test dengan MQTT client tool (MQTT Explorer, mosquitto_pub)

Problem: Pump cycling too frequently
Solution:
- Adjust hysteresis band (increase gap between MIN and MAX threshold)
- Increase MIN_PUMP_OFF_TIME untuk longer rest period
- Check soil moisture sensor positioning (bisa terlalu dekat dengan drip point)

Problem: Dashboard not updating
Solution:
- Check browser console untuk errors
- Verify API endpoint URL correct
- Check CORS settings di backend
- Test API dengan curl atau Postman
- Verify MQTT WebSocket connection (mqtt.js)


PROJECT STATUS & TODO
================================================================================

COMPLETED:
[✓] Hardware architecture design
[✓] BOM (Bill of Materials) detail
[✓] ESP32 firmware framework
[✓] MQTT communication structure
[✓] Control algorithm design
[✓] Proposal document draft
[✓] Budget & schedule planning

IN PROGRESS:
[ ] Hardware procurement
[ ] Backend API development
[ ] Frontend dashboard development
[ ] Sensor calibration
[ ] Field testing

TODO:
[ ] PCB design (optional untuk production)
[ ] Mobile app (optional untuk better UX)
[ ] Data analytics & visualization advanced
[ ] Machine learning untuk predictive control (future work)
[ ] Solar power integration (off-grid capability)
[ ] Multi-greenhouse management (scalability)


CONTRIBUTING
================================================================================

Tim Development:
- [Nama 1] - Hardware & Firmware Lead
- [Nama 2] - Backend & Infrastructure Lead
- [Nama 3] - Frontend & Documentation Lead

Untuk kontribusi atau questions, contact:
- Email: [your-email@example.com]
- GitHub: [repository-url]
- WhatsApp Group: [link jika ada]


LICENSE
================================================================================

Project ini dikembangkan untuk AITeC Competition.

Source code: Open-source (MIT License atau sesuai ketentuan lomba)
Documentation: Creative Commons Attribution 4.0 (CC BY 4.0)

Hardware design: Open-source hardware (OSHW)

Untuk commercial use atau large-scale deployment, please contact team.


ACKNOWLEDGMENTS
================================================================================

- Espressif Systems untuk ESP32 platform
- Arduino community untuk extensive libraries
- Adafruit, Sensirion, ROHM untuk sensor technologies
- Eclipse Foundation untuk Mosquitto MQTT broker
- Open-source contributors

Special thanks to:
- [Nama Pembimbing/Advisor]
- [Nama Greenhouse Partner/Mitra UMKM]
- [Universitas/Institution]


REFERENCES
================================================================================

1. Jones, H. G. (2014). Plants and Microclimate: A Quantitative Approach
   to Environmental Plant Physiology. Cambridge University Press.

2. Wolfert, S., et al. (2017). Big Data in Smart Farming – A review.
   Agricultural Systems, 153, 69-80.

3. ESP32 Technical Reference Manual. Espressif Systems.
   https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf

4. MQTT Version 5.0 Specification. OASIS Standard.
   https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html

5. FAO. (2024). Smart Agriculture for Sustainable Development.
   Food and Agriculture Organization of the United Nations.


CHANGELOG
================================================================================

Version 1.0.0 (2026-09-29)
- Initial project structure
- Hardware architecture complete
- ESP32 firmware framework
- Documentation draft


================================================================================
END OF README
================================================================================

Untuk informasi lebih detail, lihat file-file di folder docs/:
- proposal-draft.txt      → Full proposal untuk kompetisi
- rab-dan-jadwal.txt      → Budget dan timeline detail
- architecture.txt        → Hardware/software architecture lengkap
