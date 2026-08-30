import type { VehicleManufacturer, VehicleCatalogModel } from '../types';

/**
 * SPLENDOR Master Vehicle Catalog -- seed/reference data.
 *
 * This is REFERENCE data only (section 19 of the Vehicle Master Profile
 * mission): general, publicly documented facts about a manufacturer/model
 * (typical engine, horsepower, drivetrain, body style, production years).
 * It is never treated as the confirmed spec of any one real Splendor
 * vehicle -- many of these models ship in more than one real-world trim
 * with different horsepower/engine/drivetrain, so a Vehicle's OWN confirmed
 * fields are always the source of truth for what may be published. The
 * catalog exists to help staff pick a valid Manufacturer -> Model pair and
 * to pre-suggest technical fields for review, never to auto-fill and
 * publish unconfirmed specs.
 *
 * This is a curated, non-exhaustive starting set (~16 manufacturers most
 * relevant to a Dubai ultra-luxury/supercar rental fleet), not a claim of
 * worldwide completeness. New manufacturers/models are added only through
 * the reviewed propose -> approve flow in src/server/vehicleCatalog.ts --
 * never by silently editing this file with unverified data, and never by
 * an automated process writing here directly.
 */

const now = '2026-01-01T00:00:00.000Z';

function manufacturer(id: string, name: string, nameAr: string, countryOfOrigin: string): VehicleManufacturer {
  return { id, name, nameAr, countryOfOrigin, source: 'oem_official', createdAt: now, updatedAt: now };
}

export const DEFAULT_MANUFACTURERS: VehicleManufacturer[] = [
  manufacturer('ferrari', 'Ferrari', 'فيراري', 'Italy'),
  manufacturer('lamborghini', 'Lamborghini', 'لامبورغيني', 'Italy'),
  manufacturer('rolls-royce', 'Rolls-Royce', 'رولز رويس', 'United Kingdom'),
  manufacturer('bentley', 'Bentley', 'بنتلي', 'United Kingdom'),
  manufacturer('aston-martin', 'Aston Martin', 'أستون مارتن', 'United Kingdom'),
  manufacturer('mclaren', 'McLaren', 'مكلارين', 'United Kingdom'),
  manufacturer('bugatti', 'Bugatti', 'بوغاتي', 'France'),
  manufacturer('porsche', 'Porsche', 'بورشه', 'Germany'),
  manufacturer('mercedes-benz', 'Mercedes-Benz', 'مرسيدس بنز', 'Germany'),
  manufacturer('bmw', 'BMW', 'بي إم دبليو', 'Germany'),
  manufacturer('audi', 'Audi', 'أودي', 'Germany'),
  manufacturer('land-rover', 'Land Rover', 'لاند روفر', 'United Kingdom'),
  manufacturer('cadillac', 'Cadillac', 'كاديلاك', 'United States'),
  manufacturer('nissan', 'Nissan', 'نيسان', 'Japan'),
  manufacturer('maserati', 'Maserati', 'مازيراتي', 'Italy'),
  manufacturer('gmc', 'GMC', 'جي إم سي', 'United States')
];

function model(overrides: Omit<VehicleCatalogModel, 'source' | 'createdAt' | 'updatedAt'>): VehicleCatalogModel {
  return { ...overrides, source: 'oem_official', createdAt: now, updatedAt: now };
}

export const DEFAULT_CATALOG_MODELS: VehicleCatalogModel[] = [
  // Ferrari
  model({ id: 'ferrari-296-gtb', manufacturerId: 'ferrari', make: 'Ferrari', model: '296 GTB', productionYears: '2021-present', bodyStyle: 'coupe', engine: '3.0L Twin-Turbo V6 Hybrid (PHEV)', horsepower: 819, transmission: '8-speed dual-clutch', drivetrain: 'rwd', fuelType: 'phev', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'Italy' }),
  model({ id: 'ferrari-sf90-stradale', manufacturerId: 'ferrari', make: 'Ferrari', model: 'SF90 Stradale', productionYears: '2019-present', bodyStyle: 'coupe', engine: '4.0L Twin-Turbo V8 Hybrid (PHEV)', horsepower: 986, transmission: '8-speed dual-clutch', drivetrain: 'awd', fuelType: 'phev', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'Italy' }),
  model({ id: 'ferrari-purosangue', manufacturerId: 'ferrari', make: 'Ferrari', model: 'Purosangue', productionYears: '2022-present', bodyStyle: 'suv_coupe', engine: '6.5L NA V12', horsepower: 715, transmission: '8-speed dual-clutch', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 4, roofType: 'fixed', countryOfOrigin: 'Italy' }),
  model({ id: 'ferrari-roma', manufacturerId: 'ferrari', make: 'Ferrari', model: 'Roma', productionYears: '2020-present', bodyStyle: 'coupe', engine: '3.9L Twin-Turbo V8', horsepower: 611, transmission: '8-speed dual-clutch', drivetrain: 'rwd', fuelType: 'petrol', doors: 2, seats: 4, roofType: 'fixed', countryOfOrigin: 'Italy' }),

  // Lamborghini
  model({ id: 'lamborghini-revuelto', manufacturerId: 'lamborghini', make: 'Lamborghini', model: 'Revuelto', productionYears: '2023-present', bodyStyle: 'coupe', engine: '6.5L NA V12 Hybrid (PHEV)', horsepower: 1001, transmission: '8-speed dual-clutch', drivetrain: 'awd', fuelType: 'phev', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'Italy' }),
  model({ id: 'lamborghini-huracan-tecnica', manufacturerId: 'lamborghini', make: 'Lamborghini', model: 'Huracan Tecnica', productionYears: '2022-present', bodyStyle: 'coupe', engine: '5.2L NA V10', horsepower: 631, transmission: '7-speed dual-clutch', drivetrain: 'rwd', fuelType: 'petrol', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'Italy' }),
  model({ id: 'lamborghini-urus', manufacturerId: 'lamborghini', make: 'Lamborghini', model: 'Urus', productionYears: '2018-present', bodyStyle: 'suv', engine: '4.0L Twin-Turbo V8', horsepower: 657, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'Italy' }),

  // Rolls-Royce
  model({ id: 'rolls-royce-phantom', manufacturerId: 'rolls-royce', make: 'Rolls-Royce', model: 'Phantom', productionYears: '2017-present', bodyStyle: 'sedan', engine: '6.75L Twin-Turbo V12', horsepower: 563, transmission: '8-speed automatic', drivetrain: 'rwd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'rolls-royce-ghost', manufacturerId: 'rolls-royce', make: 'Rolls-Royce', model: 'Ghost', productionYears: '2020-present', bodyStyle: 'sedan', engine: '6.75L Twin-Turbo V12', horsepower: 563, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'rolls-royce-cullinan', manufacturerId: 'rolls-royce', make: 'Rolls-Royce', model: 'Cullinan', productionYears: '2018-present', bodyStyle: 'suv', engine: '6.75L Twin-Turbo V12', horsepower: 563, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'rolls-royce-spectre', manufacturerId: 'rolls-royce', make: 'Rolls-Royce', model: 'Spectre', productionYears: '2023-present', bodyStyle: 'coupe', engine: 'Dual Electric Motor', horsepower: 577, transmission: 'Single-speed', drivetrain: 'awd', fuelType: 'electric', doors: 2, seats: 4, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),

  // Bentley
  model({ id: 'bentley-continental-gt', manufacturerId: 'bentley', make: 'Bentley', model: 'Continental GT', productionYears: '2018-present', bodyStyle: 'coupe', engine: '4.0L Twin-Turbo V8', horsepower: 542, transmission: '8-speed dual-clutch', drivetrain: 'awd', fuelType: 'petrol', doors: 2, seats: 4, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'bentley-flying-spur', manufacturerId: 'bentley', make: 'Bentley', model: 'Flying Spur', productionYears: '2019-present', bodyStyle: 'sedan', engine: '4.0L Twin-Turbo V8', horsepower: 542, transmission: '8-speed dual-clutch', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'bentley-bentayga', manufacturerId: 'bentley', make: 'Bentley', model: 'Bentayga', productionYears: '2015-present', bodyStyle: 'suv', engine: '4.0L Twin-Turbo V8', horsepower: 542, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'United Kingdom' }),

  // Aston Martin
  model({ id: 'aston-martin-db12', manufacturerId: 'aston-martin', make: 'Aston Martin', model: 'DB12', productionYears: '2023-present', bodyStyle: 'coupe', engine: '4.0L Twin-Turbo V8', horsepower: 671, transmission: '8-speed automatic', drivetrain: 'rwd', fuelType: 'petrol', doors: 2, seats: 4, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'aston-martin-vantage', manufacturerId: 'aston-martin', make: 'Aston Martin', model: 'Vantage', productionYears: '2018-present', bodyStyle: 'coupe', engine: '4.0L Twin-Turbo V8', horsepower: 656, transmission: '8-speed automatic', drivetrain: 'rwd', fuelType: 'petrol', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'aston-martin-dbx707', manufacturerId: 'aston-martin', make: 'Aston Martin', model: 'DBX707', productionYears: '2022-present', bodyStyle: 'suv', engine: '4.0L Twin-Turbo V8', horsepower: 697, transmission: '9-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'United Kingdom' }),

  // McLaren
  model({ id: 'mclaren-750s', manufacturerId: 'mclaren', make: 'McLaren', model: '750S', productionYears: '2023-present', bodyStyle: 'coupe', engine: '4.0L Twin-Turbo V8', horsepower: 740, transmission: '7-speed dual-clutch', drivetrain: 'rwd', fuelType: 'petrol', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'mclaren-artura', manufacturerId: 'mclaren', make: 'McLaren', model: 'Artura', productionYears: '2021-present', bodyStyle: 'coupe', engine: '3.0L Twin-Turbo V6 Hybrid (PHEV)', horsepower: 690, transmission: '8-speed dual-clutch', drivetrain: 'rwd', fuelType: 'phev', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),

  // Bugatti
  model({ id: 'bugatti-chiron', manufacturerId: 'bugatti', make: 'Bugatti', model: 'Chiron', productionYears: '2016-2024', bodyStyle: 'coupe', engine: '8.0L Quad-Turbo W16', horsepower: 1500, transmission: '7-speed dual-clutch', drivetrain: 'awd', fuelType: 'petrol', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'France' }),

  // Porsche
  model({ id: 'porsche-911-turbo-s', manufacturerId: 'porsche', make: 'Porsche', model: '911 Turbo S', productionYears: '2020-present', bodyStyle: 'coupe', engine: '3.7L Twin-Turbo Flat-6', horsepower: 640, transmission: '8-speed dual-clutch', drivetrain: 'awd', fuelType: 'petrol', doors: 2, seats: 4, roofType: 'fixed', countryOfOrigin: 'Germany' }),
  model({ id: 'porsche-911-gt3-rs', manufacturerId: 'porsche', make: 'Porsche', model: '911 GT3 RS', productionYears: '2022-present', bodyStyle: 'coupe', engine: '4.0L NA Flat-6', horsepower: 518, transmission: '7-speed dual-clutch', drivetrain: 'rwd', fuelType: 'petrol', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'Germany' }),
  model({ id: 'porsche-cayenne-turbo-gt', manufacturerId: 'porsche', make: 'Porsche', model: 'Cayenne Turbo GT', productionYears: '2021-present', bodyStyle: 'suv', engine: '4.0L Twin-Turbo V8', horsepower: 631, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'Germany' }),
  model({ id: 'porsche-panamera-turbo', manufacturerId: 'porsche', make: 'Porsche', model: 'Panamera Turbo', productionYears: '2016-present', bodyStyle: 'sedan', engine: '4.0L Twin-Turbo V8', horsepower: 620, transmission: '8-speed dual-clutch', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 4, roofType: 'fixed', countryOfOrigin: 'Germany' }),

  // Mercedes-Benz (incl. AMG / Maybach sub-brands modeled as trims of the same manufacturer)
  model({ id: 'mercedes-s-class', manufacturerId: 'mercedes-benz', make: 'Mercedes-Benz', model: 'S-Class', productionYears: '2020-present', bodyStyle: 'sedan', engine: '3.0L Turbo I6 Hybrid', horsepower: 429, transmission: '9-speed automatic', drivetrain: 'rwd', fuelType: 'hybrid', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'Germany' }),
  model({ id: 'mercedes-maybach-s680', manufacturerId: 'mercedes-benz', make: 'Mercedes-Benz', model: 'Maybach S680', trim: 'Maybach', productionYears: '2021-present', bodyStyle: 'sedan', engine: '6.0L Twin-Turbo V12', horsepower: 621, transmission: '9-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'Germany' }),
  model({ id: 'mercedes-amg-gt', manufacturerId: 'mercedes-benz', make: 'Mercedes-Benz', model: 'AMG GT', trim: 'AMG', productionYears: '2023-present', bodyStyle: 'coupe', engine: '4.0L Twin-Turbo V8', horsepower: 577, transmission: '9-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 2, seats: 4, roofType: 'fixed', countryOfOrigin: 'Germany' }),
  model({ id: 'mercedes-g-class-g63', manufacturerId: 'mercedes-benz', make: 'Mercedes-Benz', model: 'G 63 AMG', trim: 'AMG', productionYears: '2018-present', bodyStyle: 'suv', engine: '4.0L Twin-Turbo V8', horsepower: 585, transmission: '9-speed automatic', drivetrain: '4wd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'fixed', countryOfOrigin: 'Germany' }),

  // BMW
  model({ id: 'bmw-7-series', manufacturerId: 'bmw', make: 'BMW', model: '7 Series', productionYears: '2022-present', bodyStyle: 'sedan', engine: '3.0L Turbo I6', horsepower: 375, transmission: '8-speed automatic', drivetrain: 'rwd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'Germany' }),
  model({ id: 'bmw-x7', manufacturerId: 'bmw', make: 'BMW', model: 'X7', productionYears: '2019-present', bodyStyle: 'suv', engine: '3.0L Turbo I6', horsepower: 375, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 7, roofType: 'panoramic', countryOfOrigin: 'Germany' }),
  model({ id: 'bmw-m5', manufacturerId: 'bmw', make: 'BMW', model: 'M5', productionYears: '2024-present', bodyStyle: 'sedan', engine: '4.4L Twin-Turbo V8 Hybrid (PHEV)', horsepower: 717, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'phev', doors: 4, seats: 5, roofType: 'fixed', countryOfOrigin: 'Germany' }),

  // Audi
  model({ id: 'audi-rs-q8', manufacturerId: 'audi', make: 'Audi', model: 'RS Q8', productionYears: '2020-present', bodyStyle: 'suv', engine: '4.0L Twin-Turbo V8', horsepower: 631, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'Germany' }),
  model({ id: 'audi-a8', manufacturerId: 'audi', make: 'Audi', model: 'A8', productionYears: '2017-present', bodyStyle: 'sedan', engine: '3.0L Turbo V6', horsepower: 335, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'fixed', countryOfOrigin: 'Germany' }),
  model({ id: 'audi-r8', manufacturerId: 'audi', make: 'Audi', model: 'R8', productionYears: '2015-2023', bodyStyle: 'coupe', engine: '5.2L NA V10', horsepower: 602, transmission: '7-speed dual-clutch', drivetrain: 'awd', fuelType: 'petrol', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'Germany', discontinued: true }),

  // Land Rover / Range Rover
  model({ id: 'range-rover-autobiography', manufacturerId: 'land-rover', make: 'Land Rover', model: 'Range Rover Autobiography', productionYears: '2022-present', bodyStyle: 'suv', engine: '4.4L Twin-Turbo V8', horsepower: 523, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'range-rover-sport-svr', manufacturerId: 'land-rover', make: 'Land Rover', model: 'Range Rover Sport SVR', productionYears: '2023-present', bodyStyle: 'suv', engine: '4.4L Twin-Turbo V8', horsepower: 626, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'United Kingdom' }),
  model({ id: 'defender-110', manufacturerId: 'land-rover', make: 'Land Rover', model: 'Defender 110', productionYears: '2020-present', bodyStyle: 'suv', engine: '3.0L Turbo I6 Mild-Hybrid', horsepower: 395, transmission: '8-speed automatic', drivetrain: '4wd', fuelType: 'hybrid', doors: 4, seats: 5, roofType: 'fixed', countryOfOrigin: 'United Kingdom' }),

  // Cadillac
  model({ id: 'cadillac-escalade', manufacturerId: 'cadillac', make: 'Cadillac', model: 'Escalade', productionYears: '2020-present', bodyStyle: 'suv', engine: '6.2L NA V8', horsepower: 420, transmission: '10-speed automatic', drivetrain: '4wd', fuelType: 'petrol', doors: 4, seats: 7, roofType: 'fixed', countryOfOrigin: 'United States' }),
  model({ id: 'cadillac-escalade-v', manufacturerId: 'cadillac', make: 'Cadillac', model: 'Escalade-V', trim: 'V-Series', productionYears: '2023-present', bodyStyle: 'suv', engine: '6.2L Supercharged V8', horsepower: 682, transmission: '10-speed automatic', drivetrain: '4wd', fuelType: 'petrol', doors: 4, seats: 7, roofType: 'fixed', countryOfOrigin: 'United States' }),

  // Nissan
  model({ id: 'nissan-patrol-nismo', manufacturerId: 'nissan', make: 'Nissan', model: 'Patrol Nismo', trim: 'Nismo', productionYears: '2020-present', bodyStyle: 'suv', engine: '5.6L NA V8', horsepower: 428, transmission: '7-speed automatic', drivetrain: '4wd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'fixed', countryOfOrigin: 'Japan' }),
  model({ id: 'nissan-gt-r', manufacturerId: 'nissan', make: 'Nissan', model: 'GT-R', productionYears: '2007-present', bodyStyle: 'coupe', engine: '3.8L Twin-Turbo V6', horsepower: 565, transmission: '6-speed dual-clutch', drivetrain: 'awd', fuelType: 'petrol', doors: 2, seats: 4, roofType: 'fixed', countryOfOrigin: 'Japan' }),

  // Maserati
  model({ id: 'maserati-mc20', manufacturerId: 'maserati', make: 'Maserati', model: 'MC20', productionYears: '2020-present', bodyStyle: 'coupe', engine: '3.0L Twin-Turbo V6', horsepower: 621, transmission: '8-speed dual-clutch', drivetrain: 'rwd', fuelType: 'petrol', doors: 2, seats: 2, roofType: 'fixed', countryOfOrigin: 'Italy' }),
  model({ id: 'maserati-levante-trofeo', manufacturerId: 'maserati', make: 'Maserati', model: 'Levante Trofeo', trim: 'Trofeo', productionYears: '2018-present', bodyStyle: 'suv', engine: '3.8L Twin-Turbo V8', horsepower: 580, transmission: '8-speed automatic', drivetrain: 'awd', fuelType: 'petrol', doors: 4, seats: 5, roofType: 'panoramic', countryOfOrigin: 'Italy' }),

  // GMC
  model({ id: 'gmc-yukon-denali', manufacturerId: 'gmc', make: 'GMC', model: 'Yukon Denali', trim: 'Denali', productionYears: '2020-present', bodyStyle: 'suv', engine: '6.2L NA V8', horsepower: 420, transmission: '10-speed automatic', drivetrain: '4wd', fuelType: 'petrol', doors: 4, seats: 7, roofType: 'fixed', countryOfOrigin: 'United States' })
];

export function getManufacturerById(id: string): VehicleManufacturer | undefined {
  return DEFAULT_MANUFACTURERS.find((m) => m.id === id);
}

export function getModelsForManufacturer(manufacturerId: string): VehicleCatalogModel[] {
  return DEFAULT_CATALOG_MODELS.filter((m) => m.manufacturerId === manufacturerId);
}
