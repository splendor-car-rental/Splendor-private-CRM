import { describe, expect, it } from 'vitest';
import { listManufacturers, listModelsForManufacturer } from '../src/server/vehicleCatalog';

describe('UAE vehicle catalog expansion', () => {
  it('includes the requested mainstream manufacturers', async () => {
    const manufacturers = await listManufacturers();
    const names = manufacturers.map((item) => item.name);
    expect(names).toEqual(expect.arrayContaining(['Hyundai', 'Kia', 'Nissan', 'Jetour', 'Honda']));
  });

  it('keeps model lists scoped to the selected manufacturer', async () => {
    const hyundai = await listModelsForManufacturer('hyundai');
    const kia = await listModelsForManufacturer('kia');
    const nissan = await listModelsForManufacturer('nissan');
    const jetour = await listModelsForManufacturer('jetour');
    const honda = await listModelsForManufacturer('honda');

    expect(hyundai.length).toBeGreaterThanOrEqual(15);
    expect(kia.length).toBeGreaterThanOrEqual(15);
    expect(nissan.length).toBeGreaterThanOrEqual(10);
    expect(jetour.length).toBeGreaterThanOrEqual(9);
    expect(honda.length).toBeGreaterThanOrEqual(9);
    expect(hyundai.every((item) => item.manufacturerId === 'hyundai')).toBe(true);
    expect(kia.every((item) => item.manufacturerId === 'kia')).toBe(true);
    expect(nissan.every((item) => item.manufacturerId === 'nissan')).toBe(true);
    expect(jetour.every((item) => item.manufacturerId === 'jetour')).toBe(true);
    expect(honda.every((item) => item.manufacturerId === 'honda')).toBe(true);
  });

  it('provides reference specifications for model selection', async () => {
    const patrol = (await listModelsForManufacturer('nissan')).find((item) => item.model === 'Patrol');
    expect(patrol).toMatchObject({
      engine: expect.any(String),
      horsepower: expect.any(Number),
      transmission: expect.any(String),
      drivetrain: expect.any(String),
      fuelType: expect.any(String),
      doors: expect.any(Number),
      seats: expect.any(Number)
    });
  });
});
