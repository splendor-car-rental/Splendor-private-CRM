import React, { useEffect, useState } from 'react';
import { 
  Car, Sparkles, DollarSign, Wand2, PlusCircle, CheckCircle2, 
  Layers, Shield, Gauge, Fuel, Zap, Search, Filter, Check
} from 'lucide-react';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';
import { apiFetch } from '../../lib/apiFetch';
import {
  VehicleCategory, VehicleStatus, VehicleManufacturer, VehicleCatalogModel,
  VehicleBodyStyle, VehicleClassTier, VehicleSuvClass, VehiclePerformanceClass,
  VehicleRentalSegment, VehicleUsageType, VehicleDrivetrain, VehicleRoofType
} from '../../types';
import {
  VEHICLE_BODY_STYLES, VEHICLE_CLASS_TIERS, VEHICLE_SUV_CLASSES, VEHICLE_PERFORMANCE_CLASSES,
  VEHICLE_RENTAL_SEGMENTS, VEHICLE_USAGE_TYPES, VEHICLE_DRIVETRAINS, VEHICLE_FUEL_TYPES, VEHICLE_ROOF_TYPES,
  isSuvBodyStyle
} from '../../config/vehicleClassification';
import {
  EXTERIOR_COLOR_PRESETS, INTERIOR_COLOR_PRESETS, COUNTRY_OF_ORIGIN_PRESETS
} from '../../config/vehicleCustomizationPresets';
import { Modal } from '../common/Modal';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface VehiclePresetItem {
  make: string;
  model: string;
  year: number;
  trim?: string;
  category: VehicleCategory;
  group: 'economy' | 'suv' | 'business' | 'luxury';
  color: string;
  plateCity: string;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  securityDeposit: number;
  mileage: number;
  engine: string;
  horsepower: number;
  transmission: string;
  drivetrain: VehicleDrivetrain;
  fuelType: VehicleCatalogModel['fuelType'];
  doors: number;
  seats: number;
  bodyStyle: VehicleBodyStyle;
  vehicleClassTier: VehicleClassTier;
  suvClass?: VehicleSuvClass;
  rentalSegment: VehicleRentalSegment;
  thumbnail: string;
  badgeAr: string;
  badgeEn: string;
}

const EXTENSIVE_FLEET_PRESETS: VehiclePresetItem[] = [
  // --- ECONOMIC & DAILY FLEET (HYUNDAI / KIA / JETOUR / NISSAN / TOYOTA / MG) ---
  {
    make: 'Hyundai',
    model: 'Elantra 2.0L',
    year: 2025,
    trim: 'Smart Plus',
    category: 'economy_sedan',
    group: 'economy',
    color: 'Polar White',
    plateCity: 'Dubai',
    dailyRate: 150,
    weeklyRate: 950,
    monthlyRate: 3200,
    securityDeposit: 1500,
    mileage: 4500,
    engine: '2.0L MPI 4-Cylinder',
    horsepower: 147,
    transmission: 'Smartstream IVT / CVT',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'economy',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'هيونداي إلنترا 2025',
    badgeEn: 'Hyundai Elantra 2025'
  },
  {
    make: 'Hyundai',
    model: 'Accent 1.5L',
    year: 2025,
    trim: 'Comfort',
    category: 'economy_sedan',
    group: 'economy',
    color: 'Titan Gray',
    plateCity: 'Dubai',
    dailyRate: 120,
    weeklyRate: 750,
    monthlyRate: 2600,
    securityDeposit: 1200,
    mileage: 3200,
    engine: '1.5L MPi 4-Cylinder',
    horsepower: 115,
    transmission: 'IVT Automatic',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'economy',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'هيونداي أكسنت 2025',
    badgeEn: 'Hyundai Accent 2025'
  },
  {
    make: 'Kia',
    model: 'Pegas 1.4L',
    year: 2025,
    trim: 'EX Full Option',
    category: 'economy_sedan',
    group: 'economy',
    color: 'Sparkling Silver',
    plateCity: 'Dubai',
    dailyRate: 110,
    weeklyRate: 700,
    monthlyRate: 2400,
    securityDeposit: 1000,
    mileage: 5100,
    engine: '1.4L MPI Kappa',
    horsepower: 95,
    transmission: '4-Speed Automatic',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'economy',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'كيا بيجاس 2025',
    badgeEn: 'Kia Pegas 2025'
  },
  {
    make: 'Kia',
    model: 'K3 / Cerato',
    year: 2025,
    trim: 'GT-Line',
    category: 'economy_sedan',
    group: 'economy',
    color: 'Abyss Black',
    plateCity: 'Dubai',
    dailyRate: 140,
    weeklyRate: 900,
    monthlyRate: 3100,
    securityDeposit: 1500,
    mileage: 2800,
    engine: '1.6L MPI 4-Cylinder',
    horsepower: 121,
    transmission: '6-Speed Automatic',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'compact',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'كيا K3 سيراتو 2025',
    badgeEn: 'Kia K3 2025'
  },
  {
    make: 'Nissan',
    model: 'Sunny 1.6L',
    year: 2025,
    trim: 'SV Comfort',
    category: 'economy_sedan',
    group: 'economy',
    color: 'Aspen White',
    plateCity: 'Dubai',
    dailyRate: 110,
    weeklyRate: 700,
    monthlyRate: 2350,
    securityDeposit: 1000,
    mileage: 6200,
    engine: '1.6L DOHC 16-Valve 4-Cylinder',
    horsepower: 118,
    transmission: 'Xtronic CVT',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'economy',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'نيسان صني 2025',
    badgeEn: 'Nissan Sunny 2025'
  },
  {
    make: 'Toyota',
    model: 'Yaris Sedan',
    year: 2025,
    trim: 'Y Plus',
    category: 'economy_sedan',
    group: 'economy',
    color: 'Silver Metallic',
    plateCity: 'Dubai',
    dailyRate: 125,
    weeklyRate: 800,
    monthlyRate: 2700,
    securityDeposit: 1200,
    mileage: 3800,
    engine: '1.5L Dual VVT-i',
    horsepower: 105,
    transmission: 'CVT',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'economy',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'تويوتا ياريس 2025',
    badgeEn: 'Toyota Yaris 2025'
  },
  {
    make: 'MG',
    model: 'MG 5 1.5L',
    year: 2025,
    trim: 'DEL Luxury',
    category: 'economy_sedan',
    group: 'economy',
    color: 'Red Metallic',
    plateCity: 'Dubai',
    dailyRate: 115,
    weeklyRate: 720,
    monthlyRate: 2500,
    securityDeposit: 1000,
    mileage: 4100,
    engine: '1.5L 4-Cylinder',
    horsepower: 112,
    transmission: 'i-CVT',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'economy',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'إم جي 5 (MG 5) 2025',
    badgeEn: 'MG 5 2025'
  },

  // --- POPULAR CROSSOVERS & SUVS (JETOUR / HYUNDAI / KIA / GEELY / TOYOTA) ---
  {
    make: 'Jetour',
    model: 'T2 Traveller 4WD',
    year: 2025,
    trim: 'Adventure Luxury',
    category: 'midsize_suv',
    group: 'suv',
    color: 'Highway Gray Matte',
    plateCity: 'Dubai',
    dailyRate: 350,
    weeklyRate: 2200,
    monthlyRate: 7500,
    securityDeposit: 2500,
    mileage: 2100,
    engine: '2.0L Turbocharged TGDI',
    horsepower: 251,
    transmission: '7-Speed Dual-Clutch (DCT)',
    drivetrain: '4wd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'suv',
    vehicleClassTier: 'midsize',
    suvClass: 'offroad_suv',
    rentalSegment: 'standard',
    thumbnail: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'جيتور T2 ترافيلر الدفع الرباعي 2025',
    badgeEn: 'Jetour T2 4WD 2025'
  },
  {
    make: 'Jetour',
    model: 'Dashing 1.6L Turbo',
    year: 2025,
    trim: 'Deluxe',
    category: 'compact_suv',
    group: 'suv',
    color: 'Crystal Cyan Blue',
    plateCity: 'Dubai',
    dailyRate: 220,
    weeklyRate: 1400,
    monthlyRate: 4800,
    securityDeposit: 2000,
    mileage: 3400,
    engine: '1.6L Turbo TGDI',
    horsepower: 194,
    transmission: '7-Speed DCT',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'crossover',
    vehicleClassTier: 'compact',
    suvClass: 'compact_suv',
    rentalSegment: 'standard',
    thumbnail: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'جيتور داشينج 2025',
    badgeEn: 'Jetour Dashing 2025'
  },
  {
    make: 'Jetour',
    model: 'X70 Plus 7-Seater',
    year: 2025,
    trim: 'Comfort 7-Seat',
    category: 'midsize_suv',
    group: 'suv',
    color: 'Pearl Black',
    plateCity: 'Dubai',
    dailyRate: 200,
    weeklyRate: 1300,
    monthlyRate: 4500,
    securityDeposit: 1800,
    mileage: 4800,
    engine: '1.6L Turbo I4',
    horsepower: 194,
    transmission: '7-Speed Dual Clutch',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 7,
    bodyStyle: 'suv',
    vehicleClassTier: 'midsize',
    suvClass: 'midsize_suv',
    rentalSegment: 'standard',
    thumbnail: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'جيتور X70 بلس 7 مقاعد 2025',
    badgeEn: 'Jetour X70 Plus (7-Seat) 2025'
  },
  {
    make: 'Hyundai',
    model: 'Creta 1.5L',
    year: 2025,
    trim: 'Smart Plus Panoramic',
    category: 'compact_suv',
    group: 'suv',
    color: 'Lava Orange',
    plateCity: 'Dubai',
    dailyRate: 170,
    weeklyRate: 1100,
    monthlyRate: 3800,
    securityDeposit: 1500,
    mileage: 3900,
    engine: '1.5L Smartstream',
    horsepower: 115,
    transmission: 'IVT Automatic',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'crossover',
    vehicleClassTier: 'compact',
    suvClass: 'compact_suv',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'هيونداي كريتا 2025',
    badgeEn: 'Hyundai Creta 2025'
  },
  {
    make: 'Hyundai',
    model: 'Tucson 2.0L',
    year: 2025,
    trim: 'Premium Panoramic',
    category: 'midsize_suv',
    group: 'suv',
    color: 'Amazon Gray',
    plateCity: 'Dubai',
    dailyRate: 220,
    weeklyRate: 1400,
    monthlyRate: 4900,
    securityDeposit: 2000,
    mileage: 3100,
    engine: '2.0L Nu MPI',
    horsepower: 156,
    transmission: '6-Speed Automatic',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'suv',
    vehicleClassTier: 'midsize',
    suvClass: 'midsize_suv',
    rentalSegment: 'standard',
    thumbnail: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'هيونداي توسان 2025',
    badgeEn: 'Hyundai Tucson 2025'
  },
  {
    make: 'Kia',
    model: 'Sportage 2.0L',
    year: 2025,
    trim: 'EX Full Option',
    category: 'midsize_suv',
    group: 'suv',
    color: 'Jungle Wood Green',
    plateCity: 'Dubai',
    dailyRate: 230,
    weeklyRate: 1450,
    monthlyRate: 5100,
    securityDeposit: 2000,
    mileage: 2900,
    engine: '2.0L MPI 4-Cylinder',
    horsepower: 154,
    transmission: '6-Speed Automatic',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'suv',
    vehicleClassTier: 'midsize',
    suvClass: 'midsize_suv',
    rentalSegment: 'standard',
    thumbnail: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'كيا سبورتاج 2025',
    badgeEn: 'Kia Sportage 2025'
  },
  {
    make: 'Kia',
    model: 'Seltos 1.5L Turbo',
    year: 2025,
    trim: 'GT-Line AWD',
    category: 'compact_suv',
    group: 'suv',
    color: 'Gravity Gray',
    plateCity: 'Dubai',
    dailyRate: 190,
    weeklyRate: 1200,
    monthlyRate: 4200,
    securityDeposit: 1800,
    mileage: 3600,
    engine: '1.5L Turbo GDI',
    horsepower: 158,
    transmission: '7-Speed Dual Clutch',
    drivetrain: 'awd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'crossover',
    vehicleClassTier: 'compact',
    suvClass: 'compact_suv',
    rentalSegment: 'standard',
    thumbnail: 'https://images.unsplash.com/photo-1508974239320-0a029497e820?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'كيا سيلتوس GT 2025',
    badgeEn: 'Kia Seltos 2025'
  },
  {
    make: 'Geely',
    model: 'Coolray 1.5L Turbo',
    year: 2025,
    trim: 'Sport Flagship',
    category: 'compact_suv',
    group: 'suv',
    color: 'Cyber Blue',
    plateCity: 'Dubai',
    dailyRate: 180,
    weeklyRate: 1150,
    monthlyRate: 4000,
    securityDeposit: 1800,
    mileage: 2600,
    engine: '1.5L NordThor Turbo',
    horsepower: 172,
    transmission: '7-Speed Wet DCT',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'crossover',
    vehicleClassTier: 'compact',
    suvClass: 'compact_suv',
    rentalSegment: 'economy',
    thumbnail: 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'جيلي كول راي سبورت 2025',
    badgeEn: 'Geely Coolray 2025'
  },

  // --- BUSINESS & MIDSIZE SEDANS & VANS (SONATA / K5 / CAMRY / ALTIMA / STARIA) ---
  {
    make: 'Hyundai',
    model: 'Sonata 2.5L',
    year: 2025,
    trim: 'Smart Panoramic',
    category: 'business_sedan',
    group: 'business',
    color: 'Nocturne Gray',
    plateCity: 'Dubai',
    dailyRate: 240,
    weeklyRate: 1550,
    monthlyRate: 5400,
    securityDeposit: 2000,
    mileage: 3200,
    engine: '2.5L Smartstream GDI',
    horsepower: 191,
    transmission: '8-Speed Automatic',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'executive',
    rentalSegment: 'premium',
    thumbnail: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'هيونداي سوناتا 2025',
    badgeEn: 'Hyundai Sonata 2025'
  },
  {
    make: 'Kia',
    model: 'K5 2.5L GT-Line',
    year: 2025,
    trim: 'GT-Line',
    category: 'business_sedan',
    group: 'business',
    color: 'Steel Gray Matte',
    plateCity: 'Dubai',
    dailyRate: 250,
    weeklyRate: 1600,
    monthlyRate: 5600,
    securityDeposit: 2000,
    mileage: 2700,
    engine: '2.5L Turbo GDI',
    horsepower: 290,
    transmission: '8-Speed Wet DCT',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'executive',
    rentalSegment: 'premium',
    thumbnail: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'كيا K5 جي تي لاين 2025',
    badgeEn: 'Kia K5 2025'
  },
  {
    make: 'Toyota',
    model: 'Camry 2.5L',
    year: 2025,
    trim: 'Grande Panoramic',
    category: 'business_sedan',
    group: 'business',
    color: 'Precious Metal',
    plateCity: 'Dubai',
    dailyRate: 230,
    weeklyRate: 1500,
    monthlyRate: 5200,
    securityDeposit: 2000,
    mileage: 4100,
    engine: '2.5L Dynamic Force 4-Cylinder',
    horsepower: 204,
    transmission: '8-Speed Direct Shift',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'executive',
    rentalSegment: 'premium',
    thumbnail: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'تويوتا كامري 2025',
    badgeEn: 'Toyota Camry 2025'
  },
  {
    make: 'Nissan',
    model: 'Altima 2.5L',
    year: 2025,
    trim: 'SL Full Option',
    category: 'business_sedan',
    group: 'business',
    color: 'Gun Metallic',
    plateCity: 'Dubai',
    dailyRate: 210,
    weeklyRate: 1350,
    monthlyRate: 4700,
    securityDeposit: 1800,
    mileage: 4900,
    engine: '2.5L DOHC 4-Cylinder',
    horsepower: 188,
    transmission: 'Xtronic CVT',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 5,
    bodyStyle: 'sedan',
    vehicleClassTier: 'executive',
    rentalSegment: 'standard',
    thumbnail: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'نيسان ألتيما 2025',
    badgeEn: 'Nissan Altima 2025'
  },
  {
    make: 'Hyundai',
    model: 'Staria 9-Seater Luxury',
    year: 2025,
    trim: 'Lounge 9-Seater VIP',
    category: 'family_van',
    group: 'business',
    color: 'Abyss Black Pearl',
    plateCity: 'Dubai',
    dailyRate: 450,
    weeklyRate: 2900,
    monthlyRate: 9800,
    securityDeposit: 3000,
    mileage: 5200,
    engine: '3.5L Smartstream V6',
    horsepower: 272,
    transmission: '8-Speed Automatic',
    drivetrain: 'fwd',
    fuelType: 'petrol',
    doors: 4,
    seats: 9,
    bodyStyle: 'mpv',
    vehicleClassTier: 'executive',
    rentalSegment: 'vip',
    thumbnail: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'هيونداي ستاريا VIP 9 ركاب 2025',
    badgeEn: 'Hyundai Staria VIP 2025'
  },

  // --- LUXURY & SUPERCARS (FERRARI / ROLLS-ROYCE / LAMBORGHINI / MAYBACH / PORSCHE / PATROL NISMO) ---
  {
    make: 'Ferrari',
    model: 'Purosangue V12',
    year: 2025,
    trim: 'V12 Active Suspension',
    category: 'supercar',
    group: 'luxury',
    color: 'Rosso Corsa',
    plateCity: 'Dubai',
    dailyRate: 9500,
    weeklyRate: 58000,
    monthlyRate: 190000,
    securityDeposit: 20000,
    mileage: 1200,
    engine: '6.5L Naturally Aspirated V12',
    horsepower: 715,
    transmission: '8-Speed Dual-Clutch F1',
    drivetrain: 'awd',
    fuelType: 'petrol',
    doors: 4,
    seats: 4,
    bodyStyle: 'suv',
    vehicleClassTier: 'hypercar',
    suvClass: 'performance_suv',
    rentalSegment: 'supercar',
    thumbnail: 'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'فيراري بوروسانجوي V12',
    badgeEn: 'Ferrari Purosangue V12'
  },
  {
    make: 'Rolls-Royce',
    model: 'Spectre Ultra-Electric',
    year: 2025,
    trim: 'Bespoke Starlight',
    category: 'ultra_luxury_sedan',
    group: 'luxury',
    color: 'Two-Tone Obsidian Black & Arctic Silver',
    plateCity: 'Dubai',
    dailyRate: 8500,
    weeklyRate: 52000,
    monthlyRate: 180000,
    securityDeposit: 25000,
    mileage: 850,
    engine: 'Dual Synchronous Electric Motors',
    horsepower: 577,
    transmission: 'Direct Drive Single-Speed',
    drivetrain: 'awd',
    fuelType: 'electric',
    doors: 2,
    seats: 4,
    bodyStyle: 'coupe',
    vehicleClassTier: 'ultra_luxury',
    rentalSegment: 'ultra_luxury',
    thumbnail: 'https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'رولز رويس سبيكتر الفاخرة',
    badgeEn: 'Rolls-Royce Spectre 2025'
  },
  {
    make: 'Lamborghini',
    model: 'Revuelto V12 Hybrid',
    year: 2025,
    trim: 'HPEV Flagship',
    category: 'supercar',
    group: 'luxury',
    color: 'Arancio Apodis (Orange Pearl)',
    plateCity: 'Dubai',
    dailyRate: 11000,
    weeklyRate: 68000,
    monthlyRate: 230000,
    securityDeposit: 25000,
    mileage: 950,
    engine: '6.5L V12 + 3 Electric Motors',
    horsepower: 1001,
    transmission: '8-Speed Dual-Clutch',
    drivetrain: 'awd',
    fuelType: 'hybrid',
    doors: 2,
    seats: 2,
    bodyStyle: 'coupe',
    vehicleClassTier: 'hypercar',
    rentalSegment: 'hypercar',
    thumbnail: 'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'لامبورغيني ريفويلتو 1001 حصان',
    badgeEn: 'Lamborghini Revuelto V12'
  },
  {
    make: 'Mercedes-Maybach',
    model: 'GLS 600 Night Series',
    year: 2025,
    trim: 'Night Series First Class',
    category: 'executive_suv',
    group: 'luxury',
    color: 'Kalahari Gold / Onyx Black',
    plateCity: 'Dubai',
    dailyRate: 6000,
    weeklyRate: 36000,
    monthlyRate: 120000,
    securityDeposit: 15000,
    mileage: 2100,
    engine: '4.0L Biturbo V8 EQ Boost',
    horsepower: 550,
    transmission: '9G-TRONIC Automatic',
    drivetrain: 'awd',
    fuelType: 'hybrid',
    doors: 4,
    seats: 4,
    bodyStyle: 'suv',
    vehicleClassTier: 'ultra_luxury',
    suvClass: 'luxury_suv',
    rentalSegment: 'vip',
    thumbnail: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'مايباخ GLS 600 نايت سيريس',
    badgeEn: 'Maybach GLS 600 Night Series'
  },
  {
    make: 'Nissan',
    model: 'Patrol Nismo V6 Twin-Turbo',
    year: 2025,
    trim: 'Nismo High Performance',
    category: 'executive_suv',
    group: 'luxury',
    color: 'Pearl White / Nismo Red',
    plateCity: 'Dubai',
    dailyRate: 1800,
    weeklyRate: 11000,
    monthlyRate: 38000,
    securityDeposit: 5000,
    mileage: 1800,
    engine: '3.5L Twin-Turbocharged V6',
    horsepower: 495,
    transmission: '9-Speed Automatic',
    drivetrain: '4wd',
    fuelType: 'petrol',
    doors: 4,
    seats: 7,
    bodyStyle: 'suv',
    vehicleClassTier: 'sport',
    suvClass: 'performance_suv',
    rentalSegment: 'vip',
    thumbnail: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop&q=80',
    badgeAr: 'نيسان باترول نيسمو 2025',
    badgeEn: 'Nissan Patrol Nismo 2025'
  }
];

type Tab = 'basic' | 'classification' | 'technical' | 'pricing';
type PresetGroup = 'all' | 'economy' | 'suv' | 'business' | 'luxury';

const emptyForm = () => ({
  make: 'Hyundai',
  model: 'Elantra 2.0L',
  year: 2025,
  trim: 'Smart Plus',
  category: 'economy_sedan' as VehicleCategory,
  exteriorColor: 'Polar White',
  interiorColor: 'Beige Leather',
  countryOfOrigin: 'South Korea',
  plateNumber: `DXB ${String.fromCharCode(65 + Math.floor(Math.random() * 26))} ${Math.floor(100 + Math.random() * 900)}`,
  plateCity: 'Dubai',
  vin: `KMH${Math.floor(10000000000000 + Math.random() * 90000000000000)}`,
  dailyRate: 150,
  weeklyRate: 950,
  monthlyRate: 3200,
  minDeposit: 1500,
  mileage: 4500,
  fuelType: 'petrol' as VehicleCatalogModel['fuelType'],
  transmission: 'Smartstream IVT / Automatic',
  engine: '2.0L MPI 4-Cylinder',
  horsepower: 147,
  doors: 4 as number | undefined,
  seats: 5 as number | undefined,
  roofType: 'fixed' as VehicleRoofType | undefined,
  drivetrain: 'fwd' as VehicleDrivetrain | undefined,
  bodyStyle: 'sedan' as VehicleBodyStyle | undefined,
  vehicleClassTier: 'economy' as VehicleClassTier | undefined,
  suvClass: undefined as VehicleSuvClass | undefined,
  performanceClass: 'standard' as VehiclePerformanceClass | undefined,
  rentalSegment: 'economy' as VehicleRentalSegment | undefined,
  usageTypes: ['daily', 'family'] as VehicleUsageType[],
  catalogModelId: 'hyundai-elantra' as string | undefined,
  status: 'available' as VehicleStatus,
  thumbnail: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80',
  images: ['https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80']
});

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { addVehicle, firebaseSyncState, showToast } = useCRM();
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<Tab>('basic');
  const [presetGroup, setPresetGroup] = useState<PresetGroup>('all');
  const [presetSearch, setPresetSearch] = useState('');

  const [form, setForm] = useState(emptyForm());

  const [manufacturers, setManufacturers] = useState<VehicleManufacturer[]>([]);
  const [selectedManufacturerId, setSelectedManufacturerId] = useState<string>('hyundai');
  const [catalogModels, setCatalogModels] = useState<VehicleCatalogModel[]>([]);

  const [requestModelOpen, setRequestModelOpen] = useState(false);
  const [requestModelName, setRequestModelName] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    apiFetch('/api/vehicle-catalog/manufacturers')
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setManufacturers(Array.isArray(data) ? data : []))
      .catch(() => setManufacturers([]));
  }, [isOpen]);

  useEffect(() => {
    if (!selectedManufacturerId) { setCatalogModels([]); return; }
    apiFetch(`/api/vehicle-catalog/models?manufacturerId=${encodeURIComponent(selectedManufacturerId)}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setCatalogModels(Array.isArray(data) ? data : []))
      .catch(() => setCatalogModels([]));
  }, [selectedManufacturerId]);

  const applyPreset = (preset: VehiclePresetItem) => {
    setForm(prev => ({
      ...prev,
      make: preset.make,
      model: preset.model,
      year: preset.year,
      trim: preset.trim || '',
      category: preset.category,
      exteriorColor: preset.color,
      dailyRate: preset.dailyRate,
      weeklyRate: preset.weeklyRate,
      monthlyRate: preset.monthlyRate,
      minDeposit: preset.securityDeposit,
      mileage: preset.mileage,
      engine: preset.engine,
      horsepower: preset.horsepower,
      transmission: preset.transmission,
      drivetrain: preset.drivetrain,
      fuelType: preset.fuelType,
      doors: preset.doors,
      seats: preset.seats,
      bodyStyle: preset.bodyStyle,
      vehicleClassTier: preset.vehicleClassTier,
      suvClass: preset.suvClass,
      rentalSegment: preset.rentalSegment,
      thumbnail: preset.thumbnail,
      images: [preset.thumbnail]
    }));

    // Find manufacturer id if available
    const matched = manufacturers.find(m => m.name.toLowerCase() === preset.make.toLowerCase() || m.id.toLowerCase() === preset.make.toLowerCase());
    if (matched) {
      setSelectedManufacturerId(matched.id);
    }
  };

  const handleManufacturerSelect = (id: string) => {
    setSelectedManufacturerId(id);
    const manufacturer = manufacturers.find((m) => m.id === id);
    if (manufacturer) {
      setForm(prev => ({ 
        ...prev, 
        make: manufacturer.name, 
        countryOfOrigin: manufacturer.countryOfOrigin || prev.countryOfOrigin, 
        catalogModelId: undefined 
      }));
    }
  };

  const applyCatalogModel = (model: VehicleCatalogModel) => {
    setForm(prev => ({
      ...prev,
      model: model.model,
      trim: model.trim || prev.trim,
      catalogModelId: model.id,
      bodyStyle: model.bodyStyle || prev.bodyStyle,
      engine: model.engine || prev.engine,
      horsepower: model.horsepower || prev.horsepower,
      transmission: model.transmission || prev.transmission,
      drivetrain: model.drivetrain || prev.drivetrain,
      fuelType: model.fuelType || prev.fuelType,
      doors: model.doors ?? prev.doors,
      seats: model.seats ?? prev.seats,
      roofType: model.roofType || prev.roofType,
      countryOfOrigin: model.countryOfOrigin || prev.countryOfOrigin
    }));
  };

  const toggleUsageType = (usage: VehicleUsageType) => {
    setForm(prev => ({
      ...prev,
      usageTypes: prev.usageTypes.includes(usage) ? prev.usageTypes.filter(u => u !== usage) : [...prev.usageTypes, usage]
    }));
  };

  const submitModelRequest = async () => {
    const manufacturerName = manufacturers.find(m => m.id === selectedManufacturerId)?.name || form.make;
    if (!manufacturerName || !requestModelName.trim()) return;
    setRequestSubmitting(true);
    try {
      const res = await apiFetch('/api/vehicle-catalog/model-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'new_model',
          manufacturerName,
          modelName: requestModelName.trim(),
          details: `Requested from Add Vehicle screen for ${manufacturerName} ${requestModelName.trim()}`
        })
      });
      if (res.ok) {
        setRequestSubmitted(true);
        setRequestModelName('');
      }
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addVehicle(form);
      if (showToast) {
        showToast(isAr ? `تمت إضافة المركبة ${form.make} ${form.model} بنجاح إلى الأسطول` : `Successfully registered ${form.make} ${form.model} to fleet`, 'success');
      }
      onClose();
      setForm(emptyForm());
      setSelectedManufacturerId('');
      setTab('basic');
    } catch (err: any) {
      console.error('Failed to add vehicle:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { id: Tab; labelEn: string; labelAr: string }[] = [
    { id: 'basic', labelEn: '1. Basic Information', labelAr: '١. البيانات الأساسية والماركة' },
    { id: 'classification', labelEn: '2. Classification & Segment', labelAr: '٢. فئة وتصنيف الأسطول' },
    { id: 'technical', labelEn: '3. Technical Specs', labelAr: '٣. المواصفات الفنية والمحرك' },
    { id: 'pricing', labelEn: '4. Rental Rates & Deposit', labelAr: '٤. أسعار الإيجار والتأمين' }
  ];

  const filteredPresets = EXTENSIVE_FLEET_PRESETS.filter(p => {
    const matchGroup = presetGroup === 'all' || p.group === presetGroup;
    const s = presetSearch.toLowerCase();
    const matchSearch = !s || p.make.toLowerCase().includes(s) || p.model.toLowerCase().includes(s) || p.badgeAr.includes(s);
    return matchGroup && matchSearch;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAr ? 'إضافة مركبة جديدة للأسطول (اقتصادي، عائلي، فاخر، وسوبركار)' : 'Add Vehicle to Fleet (Economic, Family, Business & Luxury)'}
      subtitle={isAr ? 'كتالوج مركزي شامل يدعم هيونداي، كيا، جيتور، تويوتا، نيسان، إم جي، وكافة الفئات الفاخرة' : 'Centralized fleet catalog supporting Hyundai, Kia, Jetour, Toyota, Nissan, MG, Geely & Luxury Supercars'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-zinc-100">
        
        {/* Quick Fleet Model Presets - Royal Sapphire Themed */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#071328] via-[#0B1E3B] to-[#071328] border border-blue-900/60 shadow-xl shadow-blue-950/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 border-b border-blue-900/40 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-300">
                <Sparkles className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <span className="text-xs font-bold text-blue-200">
                  {isAr ? 'نماذج سريعة التحميل (هيونداي، كيا، جيتور، تويوتا، نيسان، وفخامة سبلندر):' : 'Instant Pre-Fill Fleet Catalog Models:'}
                </span>
                <p className="text-[10px] text-blue-300/70">
                  {isAr ? 'انقر على أي فئة لتعبئة جميع المواصفات والأسعار ومبالغ التأمين بنقرة واحدة' : 'Click any model to instantly populate specs, rates, seating, and deposits'}
                </p>
              </div>
            </div>

            {/* Filter buttons for presets */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {[
                { id: 'all', labelAr: 'الكل', labelEn: 'All' },
                { id: 'economy', labelAr: 'اقتصادي ويومي', labelEn: 'Economic' },
                { id: 'suv', labelAr: 'جيتور وSUV', labelEn: 'Jetour & SUVs' },
                { id: 'business', labelAr: 'سيدان وفان', labelEn: 'Business & Vans' },
                { id: 'luxury', labelAr: 'سوبركار وفارهة', labelEn: 'Supercars' }
              ].map(grp => (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => setPresetGroup(grp.id as PresetGroup)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    presetGroup === grp.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40 border border-blue-400'
                      : 'bg-[#071328] text-blue-300/80 hover:text-white border border-blue-900/40 hover:bg-blue-900/30'
                  }`}
                >
                  {isAr ? grp.labelAr : grp.labelEn}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
            {filteredPresets.map(p => (
              <button
                key={`${p.make}-${p.model}`}
                type="button"
                onClick={() => applyPreset(p)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                  form.make === p.make && form.model === p.model
                    ? 'bg-blue-600 text-white border-blue-300 shadow-md shadow-blue-600/40 scale-[1.02]'
                    : 'bg-[#0B1E3B]/70 hover:bg-blue-900/40 border-blue-900/60 text-blue-200 hover:text-white hover:border-blue-500/50'
                }`}
              >
                <Car className="w-3.5 h-3.5 text-blue-400" />
                <span>{isAr ? p.badgeAr : p.badgeEn}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-950/80 border border-blue-800 text-blue-300 font-mono">
                  {p.dailyRate} AED/d
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Live Cloud Status Banner */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#071328] via-[#0B1E3B] to-[#071328] border border-blue-900/50 text-xs text-blue-200">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold">{isAr ? 'نظام سبلندر الملكي السحابي متصل:' : 'Splendor Cloud Active:'}</span>
            <span className="text-blue-300 font-mono text-[11px] bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-800/40">
              {firebaseSyncState.projectId || 'production-splendor-db'}
            </span>
          </div>
          <div className="text-[11px] text-blue-400 font-medium">
            {isAr ? 'المركبة الحالية المختارة:' : 'Current Form:'} <span className="font-bold text-white">{form.make} {form.model} ({form.year})</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-blue-900/40 pb-2 overflow-x-auto">
          {tabs.map(tb => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                tab === tb.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/40'
                  : 'bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-zinc-800'
              }`}
            >
              {isAr ? tb.labelAr : tb.labelEn}
            </button>
          ))}
        </div>

        {/* TAB 1: BASIC INFO */}
        {tab === 'basic' && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-blue-200 mb-1.5">
                  {isAr ? 'الشركة المصنعة (الكتالوج الشامل المركزي)' : 'Manufacturer (Master Catalog)'} *
                </label>
                <select
                  value={selectedManufacturerId}
                  onChange={(e) => handleManufacturerSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/90 border border-blue-900/50 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="">{isAr ? '— اختر شركة من القائمة أو اكتب يدوياً —' : '— Select from master list or enter below —'}</option>
                  {manufacturers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}{m.nameAr ? ` / ${m.nameAr}` : ''}</option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={form.make}
                  onChange={e => setForm({ ...form, make: e.target.value })}
                  className="mt-2 w-full px-3.5 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none"
                  placeholder={isAr ? 'اسم الشركة المصنعة (مثال: Hyundai, Kia, Jetour)' : 'Manufacturer name'}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-blue-200 mb-1.5">
                  {isAr ? 'الموديل (مربوط تلقائياً بالشركة المختارة)' : 'Model (linked to selected manufacturer)'} *
                </label>
                <select
                  disabled={!selectedManufacturerId}
                  value={form.catalogModelId || ''}
                  onChange={(e) => {
                    const model = catalogModels.find(m => m.id === e.target.value);
                    if (model) applyCatalogModel(model);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/90 border border-blue-900/50 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer disabled:opacity-40"
                >
                  <option value="">{isAr ? '— اختر الموديل المقترح من الكتالوج —' : '— Select model from catalog —'}</option>
                  {catalogModels.map(m => (
                    <option key={m.id} value={m.id}>{m.model}{m.trim ? ` (${m.trim})` : ''}</option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value, catalogModelId: undefined })}
                  className="mt-2 w-full px-3.5 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none"
                  placeholder={isAr ? 'اسم الموديل (مثال: Elantra, T2 Traveller, Pegas)' : 'Model name'}
                />
                {selectedManufacturerId && (
                  <button
                    type="button"
                    onClick={() => setRequestModelOpen(v => !v)}
                    className="mt-2 text-[11px] text-blue-300 hover:text-blue-200 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
                    {isAr ? 'الموديل غير موجود؟ طلب إضافة موديل جديد للكتالوج المركزي' : 'Model missing? Request to add new model to master catalog'}
                  </button>
                )}
                {requestModelOpen && (
                  <div className="mt-2 p-3 rounded-xl bg-[#071328] border border-blue-900/60 space-y-2">
                    {requestSubmitted ? (
                      <p className="text-[11px] text-emerald-400 font-semibold">
                        {isAr ? '✓ تم إرسال طلب إضافة الموديل للاعتماد المركزي بنجاح.' : '✓ Request submitted for catalog approval.'}
                      </p>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={requestModelName}
                          onChange={(e) => setRequestModelName(e.target.value)}
                          placeholder={isAr ? 'اسم الموديل الجديد المقترح' : 'Proposed new model name'}
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-blue-900/40 text-white text-[11px]"
                        />
                        <button
                          type="button"
                          disabled={requestSubmitting || !requestModelName.trim()}
                          onClick={submitModelRequest}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold disabled:opacity-40"
                        >
                          {requestSubmitting ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...') : (isAr ? 'إرسال للمراجعة والاعتماد' : 'Submit for Review')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'سنة الصنع' : 'Model Year'}</label>
                <input 
                  type="number" 
                  value={form.year} 
                  onChange={e => setForm({ ...form, year: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'الفئة والتجهيز (Trim)' : 'Trim / Specification'}</label>
                <input 
                  type="text" 
                  value={form.trim} 
                  onChange={e => setForm({ ...form, trim: e.target.value })}
                  placeholder={isAr ? 'مثال: سمارت بلس / جي تي لاين / فل كامل' : 'Smart Plus / GT-Line / Deluxe'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  {isAr ? 'بلد الصنع والمنشأ' : 'Country of Origin'}
                </label>
                <div className="space-y-1.5">
                  <select
                    value={COUNTRY_OF_ORIGIN_PRESETS.some(c => c.nameAr === form.countryOfOrigin || c.nameEn === form.countryOfOrigin || `${c.flag} ${isAr ? c.nameAr : c.nameEn}` === form.countryOfOrigin) ? form.countryOfOrigin : ''}
                    onChange={e => {
                      if (e.target.value) {
                        setForm({ ...form, countryOfOrigin: e.target.value });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="">{isAr ? '— اختر بلد الصنع والمنشأ الجاهز —' : '— Select Predefined Country —'}</option>
                    {COUNTRY_OF_ORIGIN_PRESETS.map(c => (
                      <option key={c.id} value={`${c.flag} ${isAr ? c.nameAr : c.nameEn}`}>
                        {c.flag} {isAr ? c.nameAr : c.nameEn} ({c.majorMakes})
                      </option>
                    ))}
                  </select>
                  <input 
                    type="text" 
                    value={form.countryOfOrigin} 
                    onChange={e => setForm({ ...form, countryOfOrigin: e.target.value })}
                    placeholder={isAr ? 'كوريا الجنوبية / الصين / اليابان / ألمانيا' : 'South Korea / China / Japan / Germany'}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                  />
                </div>
              </div>
            </div>

            {/* Quick Country Presets Chips */}
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
              <span className="text-[11px] font-medium text-zinc-400 block mb-2">
                {isAr ? 'اختيارات سريعة لبلد الصنع والمنشأ:' : 'Quick Country Shortcuts:'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {COUNTRY_OF_ORIGIN_PRESETS.map(c => {
                  const countryLabel = `${c.flag} ${isAr ? c.nameAr : c.nameEn}`;
                  const isSelected = form.countryOfOrigin === countryLabel || form.countryOfOrigin.includes(c.nameAr) || form.countryOfOrigin.includes(c.nameEn);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm({ ...form, countryOfOrigin: countryLabel })}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                        isSelected 
                          ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50 shadow-sm' 
                          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                      }`}
                    >
                      <span>{c.flag}</span>
                      <span>{isAr ? c.nameAr : c.nameEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-blue-200 mb-1.5">
                  {isAr ? 'فئة الأسطول (شاملة الاقتصادي والفاره)' : 'Fleet Category (Full Scope)'} *
                </label>
                <select 
                  value={form.category} 
                  onChange={e => setForm({ ...form, category: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-blue-900/60 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  <optgroup label={isAr ? 'الفئات الاقتصادية واليومية' : 'Economic & Daily Fleet'}>
                    <option value="economy_sedan">{isAr ? 'سيدان اقتصادية (إلنترا، أكسنت، بيجاس، صني، ياريس)' : 'Economy Sedan (Elantra, Accent, Pegas, Sunny)'}</option>
                    <option value="economy_hatchback">{isAr ? 'هاتشباك مدمجة واقتصادية (بيكانتو، i10، سويفت)' : 'Economy Hatchback (Picanto, i10, Swift)'}</option>
                    <option value="compact_suv">{isAr ? 'كروس أوفر وSUV مدمجة (كريتا، سيلتوس، كول راي، كيكس)' : 'Compact SUV & Crossover (Creta, Seltos, Coolray)'}</option>
                    <option value="midsize_suv">{isAr ? 'SUV متوسطة وعائلية (جيتور T2، توسان، سبورتاج، X70)' : 'Midsize & Family SUV (Jetour T2, Tucson, Sportage)'}</option>
                    <option value="business_sedan">{isAr ? 'سيدان أعمال ومتوسطة (سوناتا، K5، كامري، ألتيما)' : 'Business & Midsize Sedan (Sonata, K5, Camry)'}</option>
                    <option value="family_van">{isAr ? 'فان وعائلية سياحية (ستاريا، كارنيفال)' : 'Family Van & MPV (Staria, Carnival)'}</option>
                  </optgroup>
                  <optgroup label={isAr ? 'فئات الفخامة والسوبركارز' : 'Luxury & Supercar Fleet'}>
                    <option value="supercar">{isAr ? 'سوبركار رياضية خارقة (فيراري، لامبورغيني، بورشه)' : 'Supercar (Ferrari, Lamborghini, Porsche)'}</option>
                    <option value="ultra_luxury_sedan">{isAr ? 'سيدان فاخرة جداً VIP (رولز رويس، مايباخ، بنتلي)' : 'Ultra-Luxury Sedan (Rolls-Royce, Maybach, Bentley)'}</option>
                    <option value="executive_suv">{isAr ? 'دفع رباعي تنفيذي فاخر (إسكاليد، رينج روفر، باترول نيسمو)' : 'Luxury Executive SUV (Range Rover, Escalade, Patrol Nismo)'}</option>
                    <option value="grand_tourer">{isAr ? 'جراند تورير (بنتلي GT، أستون مارتن)' : 'Grand Tourer (Bentley GT, Aston Martin)'}</option>
                    <option value="exotic_convertible">{isAr ? 'كشف رياضية فاخرة' : 'Exotic Convertible'}</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'رقم اللوحة والإمارة' : 'Plate Number & City'} *</label>
                <input 
                  type="text" 
                  required 
                  value={form.plateNumber} 
                  onChange={e => setForm({ ...form, plateNumber: e.target.value })}
                  placeholder="Dubai A 1234"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'رقم الهيكل (VIN)' : 'VIN (Chassis Number)'}</label>
                <input 
                  type="text" 
                  value={form.vin} 
                  onChange={e => setForm({ ...form, vin: e.target.value })}
                  placeholder="KMHD..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none font-mono" 
                />
              </div>
            </div>

            {/* Colors Section with Ready-Made Presets */}
            <div className="space-y-4 p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/90">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Exterior Color */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-200">
                      {isAr ? 'اللون الخارجي' : 'Exterior Color'}
                    </label>
                    <span className="text-[11px] text-blue-400">
                      {isAr ? 'اختيارات جاهزة للألوان الخارجية' : 'Exterior Presets'}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <select
                      value={EXTERIOR_COLOR_PRESETS.some(c => (isAr ? c.nameAr : c.nameEn) === form.exteriorColor) ? form.exteriorColor : ''}
                      onChange={e => {
                        if (e.target.value) {
                          setForm({ ...form, exteriorColor: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">{isAr ? '— اختر لوناً خارجياً جاهزاً —' : '— Select Exterior Color Preset —'}</option>
                      {EXTERIOR_COLOR_PRESETS.map(c => (
                        <option key={c.id} value={isAr ? c.nameAr : c.nameEn}>
                          {isAr ? c.nameAr : c.nameEn}
                        </option>
                      ))}
                    </select>

                    <input 
                      type="text" 
                      value={form.exteriorColor} 
                      onChange={e => setForm({ ...form, exteriorColor: e.target.value })}
                      placeholder={isAr ? 'أو اكتب اللون المخصص هنا...' : 'Or enter custom color...'}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                    />

                    {/* Quick Color Swatches */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {EXTERIOR_COLOR_PRESETS.slice(0, 10).map(c => {
                        const label = isAr ? c.nameAr : c.nameEn;
                        const isSelected = form.exteriorColor === label || form.exteriorColor === c.nameAr || form.exteriorColor === c.nameEn;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setForm({ ...form, exteriorColor: label })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1.5 transition-all ${
                              isSelected 
                                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400' 
                                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                            }`}
                            title={label}
                          >
                            <span 
                              className="w-3 h-3 rounded-full border border-white/20 shadow-xs shrink-0" 
                              style={{ backgroundColor: c.hex }} 
                            />
                            <span className="truncate max-w-[110px]">{label.split('/')[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Interior Color */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-200">
                      {isAr ? 'اللون الداخلي وتفاصيل المقصورة' : 'Interior Color & Trim'}
                    </label>
                    <span className="text-[11px] text-amber-400">
                      {isAr ? 'خيارات الجلود والمقصورة' : 'Interior Leather Presets'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <select
                      value={INTERIOR_COLOR_PRESETS.some(c => (isAr ? c.nameAr : c.nameEn) === form.interiorColor) ? form.interiorColor : ''}
                      onChange={e => {
                        if (e.target.value) {
                          setForm({ ...form, interiorColor: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">{isAr ? '— اختر لوناً داخلياً جاهزاً —' : '— Select Interior Color Preset —'}</option>
                      {INTERIOR_COLOR_PRESETS.map(c => (
                        <option key={c.id} value={isAr ? c.nameAr : c.nameEn}>
                          {isAr ? c.nameAr : c.nameEn}
                        </option>
                      ))}
                    </select>

                    <input 
                      type="text" 
                      value={form.interiorColor} 
                      onChange={e => setForm({ ...form, interiorColor: e.target.value })}
                      placeholder={isAr ? 'أو اكتب اللون الداخلي المخصص هنا...' : 'Or enter custom interior trim...'}
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                    />

                    {/* Quick Interior Swatches */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {INTERIOR_COLOR_PRESETS.slice(0, 8).map(c => {
                        const label = isAr ? c.nameAr : c.nameEn;
                        const isSelected = form.interiorColor === label || form.interiorColor === c.nameAr || form.interiorColor === c.nameEn;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setForm({ ...form, interiorColor: label })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1.5 transition-all ${
                              isSelected 
                                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/60 shadow-sm' 
                                : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800'
                            }`}
                            title={label}
                          >
                            <span 
                              className="w-3 h-3 rounded-full border border-white/20 shadow-xs shrink-0" 
                              style={{ backgroundColor: c.hex }} 
                            />
                            <span className="truncate max-w-[120px]">{label.split('/')[0]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Thumbnail URL */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">{isAr ? 'رابط صورة المركبة' : 'Vehicle Image URL'}</label>
              <div className="flex gap-3 items-center">
                <input
                  type="url"
                  value={form.thumbnail}
                  onChange={e => setForm({ ...form, thumbnail: e.target.value, images: [e.target.value] })}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none"
                  placeholder="https://..."
                />
                {form.thumbnail && (
                  <img src={form.thumbnail} alt="Preview" className="w-14 h-10 rounded-xl object-cover border border-blue-800/60 shadow" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CLASSIFICATION */}
        {tab === 'classification' && (
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-blue-900/40 space-y-4 animate-fade-in">
            <h4 className="text-xs font-bold text-blue-300 flex items-center gap-2 uppercase tracking-wide">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>{isAr ? 'التصنيف المتقدم وتجزئة الأسطول' : 'Advanced Fleet Classification'}</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع الهيكل (Body Style)' : 'Body Style'}</label>
                <select 
                  value={form.bodyStyle || ''} 
                  onChange={e => setForm({ ...form, bodyStyle: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_BODY_STYLES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'مستوى الفئة (Class Tier)' : 'Class Tier'}</label>
                <select 
                  value={form.vehicleClassTier || ''} 
                  onChange={e => setForm({ ...form, vehicleClassTier: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_CLASS_TIERS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>

              {isSuvBodyStyle(form.bodyStyle) && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'تصنيف الدفع الرباعي (SUV Class)' : 'SUV Classification'}</label>
                  <select 
                    value={form.suvClass || ''} 
                    onChange={e => setForm({ ...form, suvClass: (e.target.value || undefined) as any })}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                  >
                    <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                    {VEHICLE_SUV_CLASSES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'تصنيف الأداء (Performance)' : 'Performance Classification'}</label>
                <select 
                  value={form.performanceClass || ''} 
                  onChange={e => setForm({ ...form, performanceClass: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_PERFORMANCE_CLASSES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'شريحة التأجير (Rental Segment)' : 'Rental Segment'}</label>
                <select 
                  value={form.rentalSegment || ''} 
                  onChange={e => setForm({ ...form, rentalSegment: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs cursor-pointer"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_RENTAL_SEGMENTS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-blue-200 mb-2">{isAr ? 'أنواع وحالات الاستخدام المستهدفة (متعدد الاختيارات):' : 'Target Usage Types (Multi-Select):'}</label>
                <div className="flex flex-wrap gap-2">
                  {VEHICLE_USAGE_TYPES.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleUsageType(o.value)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        form.usageTypes.includes(o.value)
                          ? 'bg-blue-600 text-white border-blue-400 shadow-sm shadow-blue-600/30'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {isAr ? o.labelAr : o.labelEn}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TECHNICAL SPECS */}
        {tab === 'technical' && (
          <div className="space-y-4 animate-fade-in">
            {form.catalogModelId && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-blue-950/60 border border-blue-800/60 text-xs text-blue-300">
                <Wand2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>
                  {isAr
                    ? 'تم سحب المواصفات المرجعية للموديل تلقائياً — يمكنك تعديل أي خانة بحرية لتوافق المركبة الفعلية.'
                    : 'Reference model specifications loaded — you can freely adjust any parameter to match the real vehicle.'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'المحرك والسعة' : 'Engine Spec'}</label>
                <input 
                  type="text" 
                  value={form.engine} 
                  onChange={e => setForm({ ...form, engine: e.target.value })}
                  placeholder="2.0L MPI / 1.6L Turbo / V6"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'القدرة الحصانية (HP)' : 'Horsepower (HP)'}</label>
                <input 
                  type="number" 
                  value={form.horsepower} 
                  onChange={e => setForm({ ...form, horsepower: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'ناقل الحركة (Transmission)' : 'Transmission'}</label>
                <input 
                  type="text" 
                  value={form.transmission} 
                  onChange={e => setForm({ ...form, transmission: e.target.value })}
                  placeholder="Automatic / CVT / 7-Speed DCT"
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs focus:border-blue-500 focus:outline-none" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نظام الدفع (Drivetrain)' : 'Drivetrain'}</label>
                <select 
                  value={form.drivetrain || ''} 
                  onChange={e => setForm({ ...form, drivetrain: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs cursor-pointer focus:border-blue-500 focus:outline-none"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_DRIVETRAINS.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع الوقود / الدفع' : 'Fuel / Powertrain'}</label>
                <select 
                  value={form.fuelType} 
                  onChange={e => setForm({ ...form, fuelType: e.target.value as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs cursor-pointer focus:border-blue-500 focus:outline-none"
                >
                  {VEHICLE_FUEL_TYPES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'نوع السقف' : 'Roof Type'}</label>
                <select 
                  value={form.roofType || ''} 
                  onChange={e => setForm({ ...form, roofType: (e.target.value || undefined) as any })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs cursor-pointer focus:border-blue-500 focus:outline-none"
                >
                  <option value="">{isAr ? '— غير محدد —' : '— Not set —'}</option>
                  {VEHICLE_ROOF_TYPES.map(o => <option key={o.value} value={o.value}>{isAr ? o.labelAr : o.labelEn}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'عدد الأبواب' : 'Doors'}</label>
                <input 
                  type="number" 
                  value={form.doors ?? ''} 
                  onChange={e => setForm({ ...form, doors: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'عدد المقاعد والركاب' : 'Seats / Capacity'}</label>
                <input 
                  type="number" 
                  value={form.seats ?? ''} 
                  onChange={e => setForm({ ...form, seats: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs font-mono" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">{isAr ? 'قراءة العداد الحالية (كم)' : 'Current Odometer (KM)'}</label>
                <input 
                  type="number" 
                  value={form.mileage} 
                  onChange={e => setForm({ ...form, mileage: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-xs font-mono" 
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRICING */}
        {tab === 'pricing' && (
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#071328] to-[#0B1E3B] border border-blue-900/60 space-y-4 animate-fade-in">
            <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-400" />
              {isAr ? 'تعرفة الإيجار اليومي، الأسبوعي، الشهري، ومبلغ التأمين (AED):' : 'Rental Rates & Security Deposits (AED):'}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-blue-900/40">
                <label className="block text-[11px] text-blue-200 font-semibold mb-1">{isAr ? 'السعر اليومي (AED/يوم)' : 'Daily Rate (AED/day)'}</label>
                <input 
                  type="number" 
                  value={form.dailyRate} 
                  onChange={e => setForm({ ...form, dailyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-[#071328] border border-blue-700/60 text-white font-bold text-sm font-mono focus:border-blue-400 focus:outline-none" 
                />
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <label className="block text-[11px] text-zinc-300 font-medium mb-1">{isAr ? 'السعر الأسبوعي (AED)' : 'Weekly Rate (AED)'}</label>
                <input 
                  type="number" 
                  value={form.weeklyRate} 
                  onChange={e => setForm({ ...form, weeklyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-bold text-sm font-mono focus:border-blue-400 focus:outline-none" 
                />
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                <label className="block text-[11px] text-zinc-300 font-medium mb-1">{isAr ? 'السعر الشهري (AED)' : 'Monthly Rate (AED)'}</label>
                <input 
                  type="number" 
                  value={form.monthlyRate} 
                  onChange={e => setForm({ ...form, monthlyRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 font-bold text-sm font-mono focus:border-blue-400 focus:outline-none" 
                />
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/80 border border-amber-500/30">
                <label className="block text-[11px] text-amber-300 font-semibold mb-1">{isAr ? 'مبلغ التأمين المحتجز (AED)' : 'Security Deposit (AED)'}</label>
                <input 
                  type="number" 
                  value={form.minDeposit} 
                  onChange={e => setForm({ ...form, minDeposit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg bg-[#071328] border border-amber-500/50 text-amber-300 font-bold text-sm font-mono focus:border-amber-400 focus:outline-none" 
                />
              </div>
            </div>
          </div>
        )}

        {/* Modal Action Buttons - Royal Sapphire Luxury */}
        <div className="flex items-center justify-between pt-4 border-t border-blue-900/40">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-5 py-2.5 rounded-xl border border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-xs font-semibold transition-all cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs lg:text-sm shadow-xl shadow-blue-600/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Car className="w-4 h-4" />
            <span>
              {submitting 
                ? (isAr ? 'جاري الحفظ في الأسطول...' : 'Registering to Fleet...') 
                : (isAr ? `إضافة المركبة (${form.make} ${form.model}) للأسطول` : `Register ${form.make} ${form.model}`)}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
