# AirGradient

Join Us in the Fight Against Air Pollution

Seven million people die every year due to air pollution. Monitoring air quality enables people worldwide to better protect themselves.

We are on a mission to bring accurate and affordable air quality monitoring to every corner of the planet and we are supported by a community of more than 10,000 engaged citizens who have already deployed an AirGradient monitor.

To maximize our impact, we have completely open-sourced and shared our monitor design so that others can build upon it.

## Connection types


| Platform    | Connection | Pairing                                    | Monitors         |
| ----------- | ---------- | ------------------------------------------ | ---------------- |
| Homey Pro   | Local      | Auto discovery (mDNS), or enter IP address | Indoor & Outdoor |
| Homey Cloud | Cloud      | AirGradient API key                        | Indoor & Outdoor |




## Capabilities Reported

The monitors within Homey have the following measurements reported as capabilities


| Measurement       | Description                                      | Units | Available Settings                                                                               |
| ----------------- | ------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------ |
| PM1               | Particulate Matter 1.0                           | µg/m³ |                                                                                                  |
| PM25              | Particulate Matter 2.5                           | µg/m³ | [x] Use Corrected Value                                                                          |
| PM10              | Particulate Matter 10                            | µg/m³ |                                                                                                  |
| CO2               | Carbon Dioxide                                   | ppm   |                                                                                                  |
| PM0.3 Count       | Particulate Matter 0.3 Count                     |       |                                                                                                  |
| Temperature       | Temperature                                      | °C    | [x] Use Corrected Value (only Open Air outdoor model) [x] Direct Sunlight Compensation (outdoor) |
| Humidity          | Relative Humidity                                | %     | [x] Use Corrected Value (only Open Air outdoor model)                                            |
| Dew Point         | Dew Point                                        | °C    |                                                                                                  |
| Absolute Humidity | Absolute Humidity                                | g/m³  |                                                                                                  |
| Humidex           | Humidex Comfort Index                            | °C    |                                                                                                  |
| US AQI            | US Air Quality Index (outdoor only)              |       |                                                                                                  |
| GO IAQS Score     | Global Open Indoor Air Quality Score (indoor)    | 0–10  |                                                                                                  |
| TVOC              | Total VOC                                        | ppb   |                                                                                                  |
| VOC Index         | Sensirion VOC (Volatile Organic Compounds) Index | idx   |                                                                                                  |
| VOC Raw           | VOC Raw Value                                    | ticks | [x] Show Raw VOC/NOx                                                                             |
| NOx Index         | Sensirion NOx (Nitrogen Oxides) Index            | idx   |                                                                                                  |
| NOx Raw           | NOx Raw Value                                    | ticks | [x] Show Raw VOC/NOx                                                                             |




## Calculated Capabilities

These values are derived by the Homey app from sensor readings. AirGradient does not report them directly.

### Dew Point

The temperature at which air becomes saturated and water vapour begins to condense. Calculated from temperature and relative humidity using the Magnus–Tetens approximation.

Sources:

- [https://doi.org/10.1175/BAMS-86-2-225](https://doi.org/10.1175/BAMS-86-2-225) — Lawrence (2005), *Bulletin of the American Meteorological Society*: Magnus form and dew-point inversion
- [https://doi.org/10.1175/1520-0450(1996)035%3C0601:IMFAOS%3E2.0.CO;2](https://doi.org/10.1175/1520-0450(1996)035%3C0601:IMFAOS%3E2.0.CO;2) — Alduchov & Eskridge (1996), optimized Magnus coefficients



### Absolute Humidity

The mass of water vapour per cubic metre of air (g/m³). Calculated from temperature and relative humidity using the August–Roche–Magnus approximation for saturation vapour pressure.

Sources:

- [https://doi.org/10.1175/BAMS-86-2-225](https://doi.org/10.1175/BAMS-86-2-225) — Lawrence (2005), *Bulletin of the American Meteorological Society*: Magnus form overview
- [https://doi.org/10.1175/1520-0450(1996)035%3C0601:IMFAOS%3E2.0.CO;2](https://doi.org/10.1175/1520-0450(1996)035%3C0601:IMFAOS%3E2.0.CO;2) — Alduchov & Eskridge (1996), Magnus coefficients



### Humidex

A Canadian heat-comfort index that combines temperature and humidity into a single “feels like” value (°C). Calculated with the Environment and Climate Change Canada formula, using dew point derived from temperature and relative humidity.

Comfort bands (Environment Canada):


| Humidex | Comfort                 |
| ------- | ----------------------- |
| < 30    | Little or no discomfort |
| 30–39   | Some discomfort         |
| 40–45   | Great discomfort        |
| > 45    | Dangerous               |


Sources:

- [https://www.canada.ca/en/services/environment/weather/severeweather/humidex.html](https://www.canada.ca/en/services/environment/weather/severeweather/humidex.html) — Environment Canada humidex comfort ranges
- [https://www.canada.ca/en/environment-climate-change/services/climate-change/canadian-centre-climate-services/display-download/technical-documentation-climate-normals.html](https://www.canada.ca/en/environment-climate-change/services/climate-change/canadian-centre-climate-services/display-download/technical-documentation-climate-normals.html) — ECCC humidex formula (technical documentation)



### US AQI

US EPA Air Quality Index derived from PM2.5, using the same concentration→AQI breakpoints as AirGradient firmware so Homey matches the AirGradient dashboard. Available on outdoor monitors.


| AQI     | Level                          |
| ------- | ------------------------------ |
| 0–50    | Good                           |
| 51–100  | Moderate                       |
| 101–150 | Unhealthy for Sensitive Groups |
| 151–200 | Unhealthy                      |
| 201–300 | Very Unhealthy                 |
| 301–500 | Hazardous                      |


Sources:

- [https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf](https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf) — EPA AQI Technical Assistance Document
- [https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html](https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html) — EPA AQS AQI breakpoint table
- [https://github.com/airgradienthq/arduino/blob/master/examples/ONE_V9/ONE_V9.ino](https://github.com/airgradienthq/arduino/blob/master/examples/ONE_V9/ONE_V9.ino) — AirGradient firmware `PM_TO_AQI_US`



### GO IAQS Score

Global Open Indoor Air Quality Score (Starter) combining PM2.5 and CO₂ into a single 10→0 index. Uses AirGradient’s published GO IAQS Starter algorithm (worst-pollutant aggregation with synergistic deduction). Available on indoor monitors.


| Score | Level     |
| ----- | --------- |
| 8–10  | Good      |
| 4–7   | Moderate  |
| 0–3   | Unhealthy |


Sources:

- [https://www.airgradient.com/blog/go-iaqs-starter-score-technical-implementation](https://www.airgradient.com/blog/go-iaqs-starter-score-technical-implementation) — GO IAQS Starter Score Technical Implementation Paper
- [https://www.airgradient.com/blog/why-we-chose-the-go-iaqs-score/](https://www.airgradient.com/blog/why-we-chose-the-go-iaqs-score/) — Why AirGradient chose GO IAQS



### TVOC

Ethanol-equivalent total VOC concentration in ppb, mapped from the Sensirion VOC Index. This is a relative estimate for building-standard / dashboard displays, not an absolute lab concentration.

Sources:

- [https://sensirion.com/media/documents/4B4D0E67/6520038C/GAS_AN_SGP4x_BuildingStandards_D1_1.pdf](https://sensirion.com/media/documents/4B4D0E67/6520038C/GAS_AN_SGP4x_BuildingStandards_D1_1.pdf) — Sensirion SGP4x building standards application note
- [https://www.airgradient.com/documentation/air-quality-parameters/](https://www.airgradient.com/documentation/air-quality-parameters/) — AirGradient air quality parameters



### VOC/NOx Index

Relative air-quality indexes from the Sensirion SGP41 gas sensor (1–500). Higher values mean stronger VOC or NOx signals compared to the recent baseline.

Sources:

- [https://sensirion.com/media/documents/5FE8673C/61E96F50/Sensirion_Gas_Sensors_Datasheet_SGP41.pdf](https://sensirion.com/media/documents/5FE8673C/61E96F50/Sensirion_Gas_Sensors_Datasheet_SGP41.pdf) — Sensirion SGP41 datasheet
- [https://sensirion.com/media/documents/02232963/6294E043/Info_Note_VOC_Index.pdf](https://sensirion.com/media/documents/02232963/6294E043/Info_Note_VOC_Index.pdf) — Sensirion VOC Index info note
- [https://sensirion.com/media/documents/9F289B95/6294DFFC/Info_Note_NOx_Index.pdf](https://sensirion.com/media/documents/9F289B95/6294DFFC/Info_Note_NOx_Index.pdf) — Sensirion NOx Index info note
- [https://sensirion.com/media/documents/ACD82D45/6294DFC0/Info_Note_Integration_VOC_NOx_Sensor.pdf](https://sensirion.com/media/documents/ACD82D45/6294DFC0/Info_Note_Integration_VOC_NOx_Sensor.pdf) — Sensirion VOC/NOx integration info note

