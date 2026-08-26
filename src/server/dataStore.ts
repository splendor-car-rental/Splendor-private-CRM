import { 
  Customer, Lead, Opportunity, Vehicle, Quotation, Reservation, 
  Contract, AdditionalCharge, Deposit, Payment, Invoice, 
  BankImportBatch, BankTransaction, CRMTask, Communication, 
  CRMDocument, DocumentTemplate, AuditLog, CustomFieldDefinition, 
  NumberingConfig, SystemHealth, NotificationItem, User 
} from '../types';

export class DataStore {
  public users: User[] = [
    {
      id: 'USR-001',
      name: 'Ahmed Morsy',
      nameAr: 'أحمد مرسي',
      email: 'ceo@splendor-rental.ae',
      role: 'ceo',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      phone: '+971 50 111 2233',
      branch: 'Dubai Downtown Flagship',
      status: 'active',
    },
    {
      id: 'USR-002',
      name: 'Tariq Al-Mansoor',
      nameAr: 'طارق المنصور',
      email: 'operations@splendor-rental.ae',
      role: 'operations',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      phone: '+971 52 444 5566',
      branch: 'Dubai Downtown Flagship',
      status: 'active',
    },
    {
      id: 'USR-003',
      name: 'Elena Rostova',
      nameAr: 'إيلينا روستوفا',
      email: 'elena.r@splendor-rental.ae',
      role: 'sales',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      phone: '+971 55 777 8899',
      branch: 'Palm Jumeirah Executive Suite',
      status: 'active',
    },
    {
      id: 'USR-004',
      name: 'Faisal Al-Hashimi',
      nameAr: 'فيصل الهاشمي',
      email: 'faisal.h@splendor-rental.ae',
      role: 'finance',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
      phone: '+971 54 999 0011',
      branch: 'Dubai Downtown Flagship',
      status: 'active',
    },
    {
      id: 'USR-005',
      name: 'Khalid Ben-Zayed',
      nameAr: 'خالد بن زايد',
      email: 'khalid.b@splendor-rental.ae',
      role: 'fleet',
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
      phone: '+971 50 333 4455',
      branch: 'Dubai International Airport VIP Terminal',
      status: 'active',
    }
  ];

  public customers: Customer[] = [
    {
      id: 'CUS-000001',
      type: 'vip',
      fullName: 'H.E. Sheikh Mansoor Al Qasimi',
      fullNameAr: 'سمو الشيخ منصور القاسمي',
      email: 'mansoor.qasimi@royaloffice.ae',
      phone: '+971 50 999 8888',
      whatsapp: '+971 50 999 8888',
      address: 'Al Wasl Road, Jumeirah 2',
      city: 'Dubai',
      country: 'United Arab Emirates',
      nationality: 'Emirati',
      idType: 'emirates_id',
      idNumber: '784-1982-1234567-1',
      idExpiryDate: '2028-11-15',
      licenseNumber: 'DXB-9876543',
      licenseCountry: 'United Arab Emirates',
      licenseExpiryDate: '2029-05-20',
      source: 'referral',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      status: 'vip',
      isVIP: true,
      tags: ['Royal Family', 'Supercar Enthusiast', 'White-Glove Delivery'],
      preferences: {
        favoriteCategory: 'supercar',
        preferredColor: 'Black / Rosso Corsa',
        deliveryLocation: 'Private Residence Jumeirah',
        specialRequests: 'Always provide Splendor Signature Scent and chilled Evian water.',
        smokingPreference: 'non-smoking'
      },
      notes: 'Prefers newest model year allocations. Direct communication with personal assistant.',
      lifetimeValue: 245000,
      totalRentals: 14,
      outstandingBalance: 0,
      securityDepositsHeld: 15000,
      createdAt: '2025-01-10T10:00:00Z',
      updatedAt: '2026-08-20T14:30:00Z',
      lastActivityAt: '2026-08-25T16:00:00Z'
    },
    {
      id: 'CUS-000002',
      type: 'corporate',
      fullName: 'David Sterling',
      fullNameAr: 'ديفيد ستيرلينغ',
      companyName: 'Sovereign Horizon Capital LLC',
      email: 'd.sterling@sovereignhorizon.com',
      phone: '+971 58 555 1234',
      whatsapp: '+971 58 555 1234',
      address: 'ICD Brookfield Place, Level 42, DIFC',
      city: 'Dubai',
      country: 'United Arab Emirates',
      nationality: 'British',
      idType: 'passport',
      idNumber: 'GB948201948',
      idExpiryDate: '2030-04-12',
      licenseNumber: 'UK-STERL893201',
      licenseCountry: 'United Kingdom',
      licenseExpiryDate: '2028-09-10',
      source: 'corporate',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      status: 'active',
      isVIP: true,
      tags: ['Corporate Tier 1', 'Executive Sedan', 'DIFC Billing'],
      preferences: {
        favoriteCategory: 'ultra_luxury_sedan',
        preferredColor: 'Two-Tone Obsidian / Silver',
        deliveryLocation: 'DIFC Gate Village Valet',
        specialRequests: 'Requires chauffeur option on standby during board meetings.',
        smokingPreference: 'non-smoking'
      },
      notes: 'Monthly corporate billing with 15-day payment cycle.',
      lifetimeValue: 480000,
      totalRentals: 28,
      outstandingBalance: 14490,
      securityDepositsHeld: 10000,
      createdAt: '2024-11-05T09:00:00Z',
      updatedAt: '2026-08-22T11:00:00Z',
      lastActivityAt: '2026-08-26T08:15:00Z'
    },
    {
      id: 'CUS-000003',
      type: 'vip',
      fullName: 'Lady Genevieve Kensington',
      fullNameAr: 'ليدي جينيفيف كنسينغتون',
      email: 'kensington.g@genevieve-holdings.co.uk',
      phone: '+44 7700 900123',
      whatsapp: '+44 7700 900123',
      address: 'Bulgari Resort Villa 12, Jumeirah Bay Island',
      city: 'Dubai',
      country: 'United Kingdom',
      nationality: 'British',
      idType: 'passport',
      idNumber: 'GB551982736',
      idExpiryDate: '2029-08-19',
      licenseNumber: 'UK-KENSI771920',
      licenseCountry: 'United Kingdom',
      licenseExpiryDate: '2027-12-01',
      source: 'partner',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      status: 'vip',
      isVIP: true,
      tags: ['High Net Worth', 'Concierge Partner', 'Rolls-Royce Preferred'],
      preferences: {
        favoriteCategory: 'ultra_luxury_sedan',
        preferredColor: 'Mandarin Interior / Black Diamond',
        deliveryLocation: 'Bulgari Resort Dubai',
        specialRequests: 'White glove handover directly at resort lobby.',
        smokingPreference: 'non-smoking'
      },
      notes: 'Stays in Dubai seasonally between October and April.',
      lifetimeValue: 185000,
      totalRentals: 8,
      outstandingBalance: 0,
      securityDepositsHeld: 10000,
      createdAt: '2025-02-14T12:00:00Z',
      updatedAt: '2026-08-24T18:00:00Z',
      lastActivityAt: '2026-08-25T20:30:00Z'
    },
    {
      id: 'CUS-000004',
      type: 'individual',
      fullName: 'Karim Benali',
      fullNameAr: 'كريم بن علي',
      email: 'karim.benali@apex-tech.fr',
      phone: '+971 52 888 3344',
      whatsapp: '+971 52 888 3344',
      address: 'Address Sky View Residences, Tower 1',
      city: 'Dubai',
      country: 'France',
      nationality: 'French',
      idType: 'emirates_id',
      idNumber: '784-1990-9988776-3',
      idExpiryDate: '2027-06-30',
      licenseNumber: 'DXB-5544332',
      licenseCountry: 'United Arab Emirates',
      licenseExpiryDate: '2028-03-15',
      source: 'instagram',
      ownerId: 'USR-002',
      ownerName: 'Ahmed Morsy',
      status: 'active',
      isVIP: false,
      tags: ['Exotic Sports', 'Weekend Renter'],
      preferences: {
        favoriteCategory: 'supercar',
        preferredColor: 'Rosso Corsa or Shark Blue',
        deliveryLocation: 'Downtown Dubai Showroom',
        specialRequests: 'Prefers vehicle with track telemetry if available.',
        smokingPreference: 'non-smoking'
      },
      notes: 'Tech founder, prompt payer, takes extreme care of vehicles.',
      lifetimeValue: 88000,
      totalRentals: 6,
      outstandingBalance: 0,
      securityDepositsHeld: 0,
      createdAt: '2025-05-20T15:00:00Z',
      updatedAt: '2026-08-18T10:00:00Z',
      lastActivityAt: '2026-08-21T14:00:00Z'
    }
  ];

  public vehicles: Vehicle[] = [
    {
      id: 'VEH-0001',
      vin: 'SCA684S51PUX01007',
      plateNumber: '1007',
      plateCity: 'Dubai VIP (Code X)',
      make: 'Rolls-Royce',
      model: 'Spectre Ultra-Luxury Coupé',
      year: 2025,
      trim: 'Bespoke Commission Mandarin Edition',
      exteriorColor: 'Black Diamond Metallic',
      interiorColor: 'Mandarin & Scivaro Grey Leather',
      category: 'ultra_luxury_sedan',
      engine: 'Dual Synchronous Electric Motors (577 HP)',
      horsepower: 577,
      transmission: 'Direct Drive All-Wheel-Drive',
      fuelType: 'electric',
      mileage: 4820,
      dailyRate: 8500,
      weeklyRate: 51000,
      monthlyRate: 185000,
      minDeposit: 10000,
      status: 'rented',
      currentLocation: 'Bulgari Resort Jumeirah Bay',
      currentCustomerId: 'CUS-000003',
      currentContractId: 'CON-000001',
      nextReservationDate: '2026-08-30T10:00:00Z',
      insuranceExpiry: '2027-03-31',
      registrationExpiry: '2027-03-31',
      lastMaintenanceMileage: 4000,
      nextMaintenanceMileage: 15000,
      maintenanceStatus: 'optimal',
      totalRevenue: 285000,
      totalExpenses: 18400,
      profitabilityScore: 94,
      images: [
        'https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80'
      ],
      thumbnail: 'https://images.unsplash.com/photo-1631295868223-63265b40d9e4?w=600&auto=format&fit=crop&q=80',
      createdAt: '2025-01-05T00:00:00Z',
      updatedAt: '2026-08-25T10:00:00Z'
    },
    {
      id: 'VEH-0002',
      vin: 'ZFF98NFA5P0296001',
      plateNumber: '296',
      plateCity: 'Dubai (Code S)',
      make: 'Ferrari',
      model: '296 GTB Assetto Fiorano',
      year: 2024,
      trim: 'Assetto Fiorano Track Package',
      exteriorColor: 'Rosso Corsa',
      interiorColor: 'Nero Alcantara with Rosso Stitching',
      category: 'supercar',
      engine: '3.0L Twin-Turbo V6 Hybrid (819 HP)',
      horsepower: 819,
      transmission: '8-Speed Dual-Clutch F1',
      fuelType: 'hybrid',
      mileage: 6310,
      dailyRate: 6500,
      weeklyRate: 39000,
      monthlyRate: 145000,
      minDeposit: 15000,
      status: 'available',
      currentLocation: 'Dubai Downtown Flagship Showroom',
      insuranceExpiry: '2027-02-28',
      registrationExpiry: '2027-02-28',
      lastMaintenanceMileage: 5000,
      nextMaintenanceMileage: 10000,
      maintenanceStatus: 'optimal',
      totalRevenue: 340000,
      totalExpenses: 28500,
      profitabilityScore: 92,
      images: [
        'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&auto=format&fit=crop&q=80'
      ],
      thumbnail: 'https://images.unsplash.com/photo-1592198084033-aade902d1aae?w=600&auto=format&fit=crop&q=80',
      createdAt: '2024-10-15T00:00:00Z',
      updatedAt: '2026-08-25T18:00:00Z'
    },
    {
      id: 'VEH-0003',
      vin: 'ZHWUR4ZF9PLA00777',
      plateNumber: '777',
      plateCity: 'Dubai VIP (Code L)',
      make: 'Lamborghini',
      model: 'Revuelto V12 HPEV',
      year: 2025,
      trim: 'Ad Personam Carbon Edition',
      exteriorColor: 'Arancio Apodis Pearl',
      interiorColor: 'Nero Ade & Arancio Dryope Alcantara',
      category: 'supercar',
      engine: '6.5L Naturally Aspirated V12 + 3 Electric Motors (1,001 HP)',
      horsepower: 1001,
      transmission: '8-Speed Dual-Clutch',
      fuelType: 'hybrid',
      mileage: 3120,
      dailyRate: 12000,
      weeklyRate: 72000,
      monthlyRate: 260000,
      minDeposit: 20000,
      status: 'reserved',
      currentLocation: 'Dubai Downtown Flagship Showroom',
      nextReservationDate: '2026-08-27T14:00:00Z',
      insuranceExpiry: '2027-05-15',
      registrationExpiry: '2027-05-15',
      lastMaintenanceMileage: 2500,
      nextMaintenanceMileage: 7500,
      maintenanceStatus: 'optimal',
      totalRevenue: 410000,
      totalExpenses: 31000,
      profitabilityScore: 96,
      images: [
        'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1544829099-b9a0c07fad1a?w=800&auto=format&fit=crop&q=80'
      ],
      thumbnail: 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=600&auto=format&fit=crop&q=80',
      createdAt: '2025-02-01T00:00:00Z',
      updatedAt: '2026-08-25T11:00:00Z'
    },
    {
      id: 'VEH-0004',
      vin: 'SCBBP6ZG7RC088888',
      plateNumber: '8888',
      plateCity: 'Dubai (Code B)',
      make: 'Bentley',
      model: 'Flying Spur Mulliner W12',
      year: 2024,
      trim: 'Mulliner Exclusive Specification',
      exteriorColor: 'Glacier White Metallic',
      interiorColor: 'Linen & Brunel Diamond Quilted Hide',
      category: 'ultra_luxury_sedan',
      engine: '6.0L Twin-Turbo W12 (626 HP)',
      horsepower: 626,
      transmission: '8-Speed Dual Clutch AWD',
      fuelType: 'petrol',
      mileage: 11450,
      dailyRate: 5500,
      weeklyRate: 33000,
      monthlyRate: 120000,
      minDeposit: 10000,
      status: 'rented',
      currentLocation: 'DIFC Gate Village VIP Parking',
      currentCustomerId: 'CUS-000002',
      currentContractId: 'CON-000002',
      insuranceExpiry: '2027-01-20',
      registrationExpiry: '2027-01-20',
      lastMaintenanceMileage: 10000,
      nextMaintenanceMileage: 20000,
      maintenanceStatus: 'optimal',
      totalRevenue: 520000,
      totalExpenses: 44000,
      profitabilityScore: 91,
      images: [
        'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800&auto=format&fit=crop&q=80'
      ],
      thumbnail: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=600&auto=format&fit=crop&q=80',
      createdAt: '2024-08-10T00:00:00Z',
      updatedAt: '2026-08-22T10:00:00Z'
    },
    {
      id: 'VEH-0005',
      vin: 'W1K2231761A999888',
      plateNumber: '999',
      plateCity: 'Dubai VIP (Code M)',
      make: 'Mercedes-Maybach',
      model: 'S680 4MATIC V12',
      year: 2024,
      trim: 'Haute Voiture Exclusive Edition',
      exteriorColor: 'Two-Tone Obsidian Black / Kalahari Gold',
      interiorColor: 'Exclusive Nappa Leather Crystal White / Bouclé',
      category: 'ultra_luxury_sedan',
      engine: '6.0L Biturbo V12 (621 HP)',
      horsepower: 621,
      transmission: '9G-TRONIC Automatic AWD',
      fuelType: 'petrol',
      mileage: 8900,
      dailyRate: 4800,
      weeklyRate: 28800,
      monthlyRate: 105000,
      minDeposit: 8000,
      status: 'available',
      currentLocation: 'Dubai Downtown Flagship Showroom',
      insuranceExpiry: '2027-04-10',
      registrationExpiry: '2027-04-10',
      lastMaintenanceMileage: 8000,
      nextMaintenanceMileage: 18000,
      maintenanceStatus: 'optimal',
      totalRevenue: 380000,
      totalExpenses: 26000,
      profitabilityScore: 93,
      images: [
        'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&auto=format&fit=crop&q=80'
      ],
      thumbnail: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=600&auto=format&fit=crop&q=80',
      createdAt: '2024-11-20T00:00:00Z',
      updatedAt: '2026-08-25T14:00:00Z'
    },
    {
      id: 'VEH-0006',
      vin: 'SALWR2V45RA555555',
      plateNumber: '5555',
      plateCity: 'Dubai (Code R)',
      make: 'Range Rover',
      model: 'SV LWB Autobiography P615',
      year: 2024,
      trim: 'SV Serenity 4-Seat Luxury Suite',
      exteriorColor: 'British Racing Green Satin',
      interiorColor: 'Perlino / Caraway Semi-Aniline Leather',
      category: 'executive_suv',
      engine: '4.4L Twin-Turbo V8 (606 HP)',
      horsepower: 606,
      transmission: '8-Speed Automatic AWD',
      fuelType: 'petrol',
      mileage: 14200,
      dailyRate: 3800,
      weeklyRate: 22800,
      monthlyRate: 85000,
      minDeposit: 7000,
      status: 'available',
      currentLocation: 'Palm Jumeirah Executive Suite',
      insuranceExpiry: '2027-03-15',
      registrationExpiry: '2027-03-15',
      lastMaintenanceMileage: 12000,
      nextMaintenanceMileage: 22000,
      maintenanceStatus: 'optimal',
      totalRevenue: 490000,
      totalExpenses: 39000,
      profitabilityScore: 92,
      images: [
        'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80'
      ],
      thumbnail: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=600&auto=format&fit=crop&q=80',
      createdAt: '2024-09-01T00:00:00Z',
      updatedAt: '2026-08-24T16:00:00Z'
    },
    {
      id: 'VEH-0007',
      vin: 'WP0AF2A97RS992001',
      plateNumber: '992',
      plateCity: 'Dubai (Code P)',
      make: 'Porsche',
      model: '911 GT3 RS (992)',
      year: 2024,
      trim: 'Weissach Package with Magnesium Rims',
      exteriorColor: 'Shark Blue',
      interiorColor: 'Black Leather & Race-Tex GT Silver',
      category: 'supercar',
      engine: '4.0L Naturally Aspirated Flat-6 (518 HP)',
      horsepower: 518,
      transmission: '7-Speed Porsche Doppelkupplung (PDK)',
      fuelType: 'petrol',
      mileage: 5200,
      dailyRate: 7200,
      weeklyRate: 43200,
      monthlyRate: 160000,
      minDeposit: 15000,
      status: 'maintenance',
      currentLocation: 'Porsche Centre Al Nabooda Service',
      insuranceExpiry: '2027-06-10',
      registrationExpiry: '2027-06-10',
      lastMaintenanceMileage: 5200,
      nextMaintenanceMileage: 10000,
      maintenanceStatus: 'in_service',
      totalRevenue: 310000,
      totalExpenses: 32000,
      profitabilityScore: 89,
      images: [
        'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&auto=format&fit=crop&q=80'
      ],
      thumbnail: 'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=600&auto=format&fit=crop&q=80',
      createdAt: '2024-12-05T00:00:00Z',
      updatedAt: '2026-08-25T08:00:00Z'
    }
  ];

  public leads: Lead[] = [
    {
      id: 'LEAD-000001',
      fullName: 'Viktor Romanov',
      companyName: 'Nordic Sky Investments',
      email: 'v.romanov@nordicsky.ch',
      phone: '+971 55 123 9988',
      source: 'whatsapp',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      status: 'negotiation',
      estimatedValue: 48000,
      preferredCategory: 'supercar',
      preferredVehicleId: 'VEH-0003',
      rentalDurationDays: 4,
      expectedStartDate: '2026-08-28',
      nextFollowUpDate: '2026-08-26',
      notes: 'Inquiring for Formula 1 VIP weekend booking. Requested Lamborghini Revuelto or Ferrari 296 GTB with track delivery.',
      aiScore: 92,
      aiSummary: 'High-intent VIP client with confirmed budget. Recommending Revuelto allocation with private chauffeur escort to Yas Marina.',
      createdAt: '2026-08-24T11:20:00Z',
      updatedAt: '2026-08-25T14:15:00Z',
      lastActivityAt: '2026-08-25T14:15:00Z'
    },
    {
      id: 'LEAD-000002',
      fullName: 'Marcello Moretti',
      companyName: 'Moretti Yachting Monaco',
      email: 'm.moretti@morettiyachts.mc',
      phone: '+377 98 00 11 22',
      source: 'partner',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      status: 'quotation',
      estimatedValue: 34000,
      preferredCategory: 'ultra_luxury_sedan',
      preferredVehicleId: 'VEH-0001',
      rentalDurationDays: 4,
      expectedStartDate: '2026-09-02',
      nextFollowUpDate: '2026-08-27',
      notes: 'Arriving via Dubai World Central VIP Terminal. Needs Rolls-Royce Spectre delivered at runway.',
      aiScore: 88,
      aiSummary: 'Monaco-based yacht broker referred by Bulgari Concierge. Very high close probability.',
      createdAt: '2026-08-23T09:00:00Z',
      updatedAt: '2026-08-25T16:30:00Z',
      lastActivityAt: '2026-08-25T16:30:00Z'
    },
    {
      id: 'LEAD-000003',
      fullName: 'Abdullah Al-Subaie',
      companyName: 'Al-Subaie Holding KSA',
      email: 'a.subaie@subaiegroup.sa',
      phone: '+966 50 777 6655',
      source: 'phone',
      ownerId: 'USR-002',
      ownerName: 'Ahmed Morsy',
      status: 'qualified',
      estimatedValue: 85000,
      preferredCategory: 'executive_suv',
      preferredVehicleId: 'VEH-0006',
      rentalDurationDays: 22,
      expectedStartDate: '2026-09-05',
      nextFollowUpDate: '2026-08-26',
      notes: 'Family vacation in Palm Jumeirah. Needs 2 luxury SUVs (Range Rover SV + Mercedes-Maybach).',
      aiScore: 95,
      aiSummary: 'Long-term luxury rental inquiry with top-tier budget. Fast follow-up recommended.',
      createdAt: '2026-08-25T08:30:00Z',
      updatedAt: '2026-08-25T17:00:00Z',
      lastActivityAt: '2026-08-25T17:00:00Z'
    },
    {
      id: 'LEAD-000004',
      fullName: 'Jason Miller',
      email: 'jason@millercreative.io',
      phone: '+971 52 901 2345',
      source: 'instagram',
      ownerId: 'USR-002',
      ownerName: 'Ahmed Morsy',
      status: 'lost',
      estimatedValue: 13000,
      preferredCategory: 'supercar',
      rentalDurationDays: 2,
      notes: 'Wanted Ferrari 296 GTB for commercial video production.',
      lostReason: 'Budget mismatch for commercial track insurance requirements.',
      createdAt: '2026-08-20T14:00:00Z',
      updatedAt: '2026-08-22T10:00:00Z',
      lastActivityAt: '2026-08-22T10:00:00Z'
    }
  ];

  public opportunities: Opportunity[] = [
    {
      id: 'OPP-000001',
      title: 'Viktor Romanov — Revuelto F1 VIP Weekend',
      leadId: 'LEAD-000001',
      customerName: 'Viktor Romanov',
      estimatedValue: 48000,
      probability: 85,
      expectedCloseDate: '2026-08-27',
      stage: 'negotiation',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      vehicleId: 'VEH-0003',
      quotationId: 'QT-000001',
      notes: 'Finalizing deposit transfer details via wire transfer.',
      createdAt: '2026-08-24T12:00:00Z',
      updatedAt: '2026-08-25T15:00:00Z'
    },
    {
      id: 'OPP-000002',
      title: 'Marcello Moretti — Spectre Airport Delivery',
      leadId: 'LEAD-000002',
      customerName: 'Marcello Moretti',
      estimatedValue: 34000,
      probability: 75,
      expectedCloseDate: '2026-08-28',
      stage: 'quotation_sent',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      vehicleId: 'VEH-0001',
      notes: 'Sent tailored quotation with VIP tarmac clearance option.',
      createdAt: '2026-08-24T10:00:00Z',
      updatedAt: '2026-08-25T16:00:00Z'
    }
  ];

  public quotations: Quotation[] = [
    {
      id: 'QT-000001',
      customerId: 'CUS-000001',
      customerName: 'H.E. Sheikh Mansoor Al Qasimi',
      customerPhone: '+971 50 999 8888',
      customerEmail: 'mansoor.qasimi@royaloffice.ae',
      vehicleId: 'VEH-0003',
      vehicleName: 'Lamborghini Revuelto V12 HPEV (2025)',
      category: 'supercar',
      startDate: '2026-08-27T14:00:00Z',
      endDate: '2026-08-30T14:00:00Z',
      durationDays: 3,
      dailyRate: 12000,
      baseTotal: 36000,
      extraServices: [
        { id: 'srv-1', name: 'White-Glove Flatbed Enclosed Delivery', nameAr: 'تسليم بناقلة مغلقة VIP', price: 2000, included: true },
        { id: 'srv-2', name: 'Track & High Speed Comprehensive Waiver', nameAr: 'تأمين شامل متقدم', price: 3500, included: true },
        { id: 'srv-3', name: 'Dedicated Splendor Concierge On-Call', nameAr: 'خدمة كونسيرج مخصصة 24/7', price: 0, included: true }
      ],
      extraServicesTotal: 5500,
      discountPercentage: 5,
      discountAmount: 2075,
      vatAmount: 1971.25, // 5% VAT
      grandTotal: 41396.25,
      securityDeposit: 20000,
      status: 'accepted',
      validUntil: '2026-08-29',
      notes: 'Delivered directly to Private Residence with telemetry technician assistance.',
      termsAndConditions: 'All rental operations subject to Splendor Executive Automotive Master Agreement and UAE RTA standards.',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      createdAt: '2026-08-24T14:00:00Z',
      updatedAt: '2026-08-25T16:00:00Z'
    }
  ];

  public reservations: Reservation[] = [
    {
      id: 'RES-000001',
      customerId: 'CUS-000001',
      customerName: 'H.E. Sheikh Mansoor Al Qasimi',
      customerPhone: '+971 50 999 8888',
      vehicleId: 'VEH-0003',
      vehicleName: 'Lamborghini Revuelto V12 (Plate: DXB L 777)',
      vehiclePlate: 'DXB L 777',
      pickupDateTime: '2026-08-27T14:00:00Z',
      returnDateTime: '2026-08-30T14:00:00Z',
      durationDays: 3,
      pickupLocation: 'Private Residence, Jumeirah 2, Dubai',
      returnLocation: 'Private Residence, Jumeirah 2, Dubai',
      dailyRate: 12000,
      totalAmount: 41396.25,
      depositAmount: 20000,
      depositStatus: 'collected',
      status: 'confirmed',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      quotationId: 'QT-000001',
      notes: 'Enclosed trailer delivery scheduled for 13:30. Driver: Salim Al-Amri.',
      createdAt: '2026-08-25T16:00:00Z',
      updatedAt: '2026-08-25T17:00:00Z'
    },
    {
      id: 'RES-000002',
      customerId: 'CUS-000003',
      customerName: 'Lady Genevieve Kensington',
      customerPhone: '+44 7700 900123',
      vehicleId: 'VEH-0001',
      vehicleName: 'Rolls-Royce Spectre (Plate: DXB VIP 1007)',
      vehiclePlate: 'DXB VIP 1007',
      pickupDateTime: '2026-08-23T10:00:00Z',
      returnDateTime: '2026-08-28T10:00:00Z',
      durationDays: 5,
      pickupLocation: 'Bulgari Resort Jumeirah Bay',
      returnLocation: 'Bulgari Resort Jumeirah Bay',
      dailyRate: 8500,
      totalAmount: 44625,
      depositAmount: 10000,
      depositStatus: 'collected',
      status: 'active',
      ownerId: 'USR-003',
      ownerName: 'Elena Rostova',
      contractId: 'CON-000001',
      notes: 'Handover completed at Bulgari Suite lobby.',
      createdAt: '2026-08-22T09:00:00Z',
      updatedAt: '2026-08-23T10:30:00Z'
    }
  ];

  public contracts: Contract[] = [
    {
      id: 'CON-000001',
      contractNumber: 'CON-2026-00084',
      reservationId: 'RES-000002',
      customerId: 'CUS-000003',
      customerName: 'Lady Genevieve Kensington',
      customerPhone: '+44 7700 900123',
      customerAddress: 'Bulgari Resort Villa 12, Jumeirah Bay Island, Dubai',
      vehicleId: 'VEH-0001',
      vehicleName: 'Rolls-Royce Spectre Bespoke Mandarin (2025)',
      vehiclePlate: 'DXB VIP 1007',
      vehicleVin: 'SCA684S51PUX01007',
      startDateTime: '2026-08-23T10:00:00Z',
      endDateTime: '2026-08-28T10:00:00Z',
      pickupLocation: 'Bulgari Resort Jumeirah Bay',
      returnLocation: 'Bulgari Resort Jumeirah Bay',
      dailyRate: 8500,
      rentalTotal: 42500,
      vatAmount: 2125,
      grandTotal: 44625,
      depositAmount: 10000,
      mileageAllowancePerDay: 250,
      extraKmRate: 15,
      depositReleaseDays: 21,
      status: 'active',
      paymentStatus: 'paid',
      depositStatus: 'held',
      termsAccepted: true,
      notes: 'Client requested extension option up to August 30 if private jet schedule moves.',
      handover: {
        handoverDateTime: '2026-08-23T10:00:00Z',
        employeeId: 'USR-002',
        employeeName: 'Ahmed Morsy',
        startMileage: 4820,
        fuelLevelPercent: 100,
        cleanliness: 'pristine',
        damages: [],
        accessories: {
          vipKeyFob: true,
          manualAndDocs: true,
          scentKit: true,
          highEndCharger: true,
          firstAidKit: true,
          safetyTriangle: true
        },
        customerSignatureUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><text x="10" y="30" font-family="cursive" font-size="20">G. Kensington</text></svg>',
        employeeSignatureUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"><text x="10" y="30" font-family="cursive" font-size="20">A. Morsy</text></svg>',
        notes: 'Delivered in showroom pristine condition with 100% battery charge.'
      },
      createdAt: '2026-08-22T14:00:00Z',
      updatedAt: '2026-08-23T10:15:00Z'
    },
    {
      id: 'CON-000002',
      contractNumber: 'CON-2026-00085',
      customerId: 'CUS-000002',
      customerName: 'David Sterling (Sovereign Horizon Capital)',
      customerPhone: '+971 58 555 1234',
      customerAddress: 'ICD Brookfield Place, Level 42, DIFC, Dubai',
      vehicleId: 'VEH-0004',
      vehicleName: 'Bentley Flying Spur Mulliner W12 (2024)',
      vehiclePlate: 'DXB B 8888',
      vehicleVin: 'SCBBP6ZG7RC088888',
      startDateTime: '2026-08-15T09:00:00Z',
      endDateTime: '2026-08-29T09:00:00Z',
      pickupLocation: 'DIFC Gate Village VIP Valet',
      returnLocation: 'DIFC Gate Village VIP Valet',
      dailyRate: 5500,
      rentalTotal: 77000,
      vatAmount: 3850,
      grandTotal: 80850,
      depositAmount: 10000,
      mileageAllowancePerDay: 300,
      extraKmRate: 12,
      depositReleaseDays: 21,
      status: 'active',
      paymentStatus: 'partially_paid',
      depositStatus: 'held',
      termsAccepted: true,
      notes: 'Corporate lease. 1st installment settled, final balance due on settlement.',
      handover: {
        handoverDateTime: '2026-08-15T09:00:00Z',
        employeeId: 'USR-002',
        employeeName: 'Ahmed Morsy',
        startMileage: 11450,
        fuelLevelPercent: 100,
        cleanliness: 'pristine',
        damages: [
          {
            id: 'DMG-01',
            part: 'rims',
            severity: 'minor_scratch',
            notes: 'Tiny hairline scratch on rear right passenger alloy rim (pre-existing).'
          }
        ],
        accessories: {
          vipKeyFob: true,
          manualAndDocs: true,
          scentKit: true,
          highEndCharger: true,
          firstAidKit: true,
          safetyTriangle: true
        },
        notes: 'Handover verified with corporate transport manager.'
      },
      createdAt: '2026-08-14T11:00:00Z',
      updatedAt: '2026-08-15T09:30:00Z'
    }
  ];

  public charges: AdditionalCharge[] = [
    {
      id: 'CHG-000001',
      type: 'salik',
      amount: 160,
      vatAmount: 8,
      totalAmount: 168,
      relatedContractId: 'CON-000002',
      customerId: 'CUS-000002',
      customerName: 'David Sterling',
      vehicleId: 'VEH-0004',
      vehiclePlate: 'DXB B 8888',
      description: 'Salik Toll Gates (Al Barsha, Al Garhoud, Al Maktoum Bridge) - 40 Crossings',
      approvalStatus: 'approved',
      approvedBy: 'USR-004',
      createdBy: 'USR-002',
      timestamp: '2026-08-25T12:00:00Z'
    }
  ];

  public deposits: Deposit[] = [
    {
      id: 'DEP-000001',
      customerId: 'CUS-000003',
      customerName: 'Lady Genevieve Kensington',
      contractId: 'CON-000001',
      reservationId: 'RES-000002',
      amount: 10000,
      appliedAmount: 0,
      refundedAmount: 0,
      balance: 10000,
      paymentMethod: 'card',
      status: 'held',
      holdReleaseDueDate: '2026-09-12',
      transactionRef: 'AUTH-CC-894102',
      notes: 'Pre-authorization held via Barclays UK World Elite Mastercard.',
      createdAt: '2026-08-23T10:00:00Z',
      updatedAt: '2026-08-23T10:00:00Z'
    },
    {
      id: 'DEP-000002',
      customerId: 'CUS-000002',
      customerName: 'David Sterling',
      contractId: 'CON-000002',
      amount: 10000,
      appliedAmount: 0,
      refundedAmount: 0,
      balance: 10000,
      paymentMethod: 'bank_transfer',
      status: 'held',
      holdReleaseDueDate: '2026-09-15',
      transactionRef: 'ENBD-DEP-99201',
      notes: 'Bank transfer received and credited to escrow deposit account.',
      createdAt: '2026-08-15T09:00:00Z',
      updatedAt: '2026-08-15T09:00:00Z'
    },
    {
      id: 'DEP-000003',
      customerId: 'CUS-000001',
      customerName: 'H.E. Sheikh Mansoor Al Qasimi',
      contractId: 'CON-000003',
      amount: 15000,
      appliedAmount: 0,
      refundedAmount: 0,
      balance: 15000,
      paymentMethod: 'bank_transfer',
      status: 'held',
      holdReleaseDueDate: '2026-09-20',
      transactionRef: 'FAB-DEP-77301',
      notes: 'Standing deposit for ongoing supercar reservations.',
      createdAt: '2026-08-25T16:30:00Z',
      updatedAt: '2026-08-25T16:30:00Z'
    }
  ];

  public invoices: Invoice[] = [
    {
      id: 'INV-000001',
      customerId: 'CUS-000003',
      customerName: 'Lady Genevieve Kensington',
      contractId: 'CON-000001',
      issueDate: '2026-08-23',
      dueDate: '2026-08-23',
      subtotal: 42500,
      vatAmount: 2125,
      totalAmount: 44625,
      paidAmount: 44625,
      balanceDue: 0,
      status: 'paid',
      items: [
        { description: 'Rolls-Royce Spectre Rental (5 Days @ 8,500 AED/Day)', quantity: 5, unitPrice: 8500, amount: 42500 }
      ],
      createdAt: '2026-08-23T10:00:00Z',
      updatedAt: '2026-08-23T10:05:00Z'
    },
    {
      id: 'INV-000002',
      customerId: 'CUS-000002',
      customerName: 'David Sterling (Sovereign Horizon Capital)',
      contractId: 'CON-000002',
      issueDate: '2026-08-15',
      dueDate: '2026-08-30',
      subtotal: 77000,
      vatAmount: 3850,
      totalAmount: 80850,
      paidAmount: 66360,
      balanceDue: 14490,
      status: 'partially_paid',
      items: [
        { description: 'Bentley Flying Spur Mulliner Rental (14 Days @ 5,500 AED/Day)', quantity: 14, unitPrice: 5500, amount: 77000 }
      ],
      createdAt: '2026-08-15T09:00:00Z',
      updatedAt: '2026-08-20T12:00:00Z'
    }
  ];

  public payments: Payment[] = [
    {
      id: 'PAY-000001',
      customerId: 'CUS-000003',
      customerName: 'Lady Genevieve Kensington',
      contractId: 'CON-000001',
      invoiceId: 'INV-000001',
      amount: 44625,
      method: 'card',
      status: 'allocated',
      referenceNumber: 'TXN-BARCLAYS-882910',
      allocatedTo: [{ invoiceId: 'INV-000001', amount: 44625 }],
      receivedBy: 'USR-004',
      receivedAt: '2026-08-23T10:05:00Z',
      receiptNumber: 'RCP-2026-00109',
      notes: 'Settled in full prior to vehicle handover.',
      createdAt: '2026-08-23T10:05:00Z'
    },
    {
      id: 'PAY-000002',
      customerId: 'CUS-000002',
      customerName: 'David Sterling',
      contractId: 'CON-000002',
      invoiceId: 'INV-000002',
      amount: 66360,
      method: 'bank_transfer',
      status: 'allocated',
      referenceNumber: 'ENBD-FT-20260818-491',
      allocatedTo: [{ invoiceId: 'INV-000002', amount: 66360 }],
      receivedBy: 'USR-004',
      receivedAt: '2026-08-18T14:30:00Z',
      receiptNumber: 'RCP-2026-00110',
      notes: 'First corporate installment for Bentley Flying Spur.',
      createdAt: '2026-08-18T14:30:00Z'
    }
  ];

  public bankImportBatches: BankImportBatch[] = [
    {
      id: 'BATCH-2026-08',
      fileName: 'EmiratesNBD_Corporate_Aug2026.csv',
      bankName: 'Emirates NBD',
      accountNumber: 'AE09 0260 0012 3456 7890 01',
      statementPeriod: '01 Aug 2026 - 25 Aug 2026',
      uploadedBy: 'Faisal Al-Hashimi',
      uploadedAt: '2026-08-25T11:00:00Z',
      totalTransactions: 6,
      matchedCount: 3,
      unmatchedCount: 2,
      duplicateCount: 1,
      status: 'ready_for_review'
    }
  ];

  public bankTransactions: BankTransaction[] = [
    {
      id: 'BTX-001',
      batchId: 'BATCH-2026-08',
      date: '2026-08-25',
      description: 'WIRE INWARD: SOVEREIGN HORIZON CAPITAL DIFC / INV-000002 PARTIAL',
      reference: 'ENBD-FT-89104',
      debit: 0,
      credit: 14490,
      balance: 1845290,
      suggestedMatch: {
        customerId: 'CUS-000002',
        customerName: 'David Sterling (Sovereign Horizon Capital)',
        invoiceId: 'INV-000002',
        contractId: 'CON-000002',
        confidence: 98,
        rationale: 'Exact amount match (14,490 AED) matching outstanding balance on invoice INV-000002 with sender entity name match.',
        rationaleAr: 'تطابق تام للمبلغ (14,490 د.إ) مع الرصيد المتبقي للفاتورة INV-000002 مع تطابق اسم الشركة المحولة.'
      },
      status: 'suggested_match',
      reconciled: false,
      notes: 'Ready for 1-click reconciliation approval.'
    },
    {
      id: 'BTX-002',
      batchId: 'BATCH-2026-08',
      date: '2026-08-24',
      description: 'ONLINE PAYMENT GATEWAY STRIPE: LADY KENSINGTON RENTAL INV-000001',
      reference: 'STRIPE-CHG-99410',
      debit: 0,
      credit: 44625,
      balance: 1830800,
      matchedRecord: {
        type: 'invoice',
        id: 'INV-000001',
        matchedBy: 'USR-004',
        matchedAt: '2026-08-24T18:00:00Z'
      },
      status: 'approved',
      reconciled: true,
      notes: 'Reconciled with receipt RCP-2026-00109.'
    },
    {
      id: 'BTX-003',
      batchId: 'BATCH-2026-08',
      date: '2026-08-23',
      description: 'DIRECT TRANSFER: KARIM BENALI / ADVANCE DEPOSIT',
      reference: 'MASHREQ-TR-77192',
      debit: 0,
      credit: 15000,
      balance: 1786175,
      suggestedMatch: {
        customerId: 'CUS-000004',
        customerName: 'Karim Benali',
        confidence: 84,
        rationale: 'Customer name match with Karim Benali. Suggested as security deposit credit for upcoming Porsche 911 GT3 booking.',
        rationaleAr: 'تطابق اسم العميل مع كريم بن علي. مقترح كوديعة تأمين لحجز بورش 911 القادم.'
      },
      status: 'suggested_match',
      reconciled: false
    },
    {
      id: 'BTX-004',
      batchId: 'BATCH-2026-08',
      date: '2026-08-22',
      description: 'SALIK TOLL DIRECT DEBIT: ROADS & TRANSPORT AUTHORITY DUBAI',
      reference: 'RTA-SALIK-DD-8819',
      debit: 2450,
      credit: 0,
      balance: 1771175,
      status: 'needs_review',
      reconciled: false,
      notes: 'Operational fleet expense: Salik bulk replenishment.'
    },
    {
      id: 'BTX-005',
      batchId: 'BATCH-2026-08',
      date: '2026-08-20',
      description: 'ENBD CORPORATE BANK CHARGES & VAT (MONTHLY MAINTENANCE)',
      reference: 'BNK-CHG-202608',
      debit: 315,
      credit: 0,
      balance: 1773625,
      status: 'approved',
      reconciled: true
    },
    {
      id: 'BTX-006',
      batchId: 'BATCH-2026-08',
      date: '2026-08-18',
      description: 'WIRE TRANSFER: SOVEREIGN HORIZON CAPITAL / ENBD-FT-20260818-491',
      reference: 'ENBD-FT-491',
      debit: 0,
      credit: 66360,
      balance: 1773940,
      matchedRecord: {
        type: 'payment',
        id: 'PAY-000002',
        matchedBy: 'USR-004',
        matchedAt: '2026-08-18T16:00:00Z'
      },
      status: 'approved',
      reconciled: true
    }
  ];

  public tasks: CRMTask[] = [
    {
      id: 'TSK-000001',
      title: 'Inspect & Prep Lamborghini Revuelto for Royal Delivery',
      titleAr: 'تجهيز وفحص لامبورغيني ريفويلتو للتسليم الملكي',
      description: 'Complete 360 detailed inspection, full interior scenting, and confirm telemetry activation.',
      category: 'lead_follow_up',
      relatedEntityType: 'reservation',
      relatedEntityId: 'RES-000001',
      relatedEntityName: 'H.E. Sheikh Mansoor Al Qasimi',
      assignedToId: 'USR-002',
      assignedToName: 'Ahmed Morsy',
      dueDate: '2026-08-27T10:00:00Z',
      priority: 'urgent',
      status: 'pending',
      createdAt: '2026-08-25T16:30:00Z',
      updatedAt: '2026-08-25T16:30:00Z'
    },
    {
      id: 'TSK-000002',
      title: 'Follow-up with Viktor Romanov regarding Revuelto contract signing',
      titleAr: 'متابعة فيكتور رومانوف لتوقيع عقد الإيجار',
      description: 'Send contract draft and coordinate payment link via WhatsApp.',
      category: 'quotation_follow_up',
      relatedEntityType: 'lead',
      relatedEntityId: 'LEAD-000001',
      relatedEntityName: 'Viktor Romanov',
      assignedToId: 'USR-003',
      assignedToName: 'Elena Rostova',
      dueDate: '2026-08-26T14:00:00Z',
      priority: 'high',
      status: 'in_progress',
      createdAt: '2026-08-25T14:00:00Z',
      updatedAt: '2026-08-25T15:00:00Z'
    },
    {
      id: 'TSK-000003',
      title: 'Reconcile 14,490 AED Wire from Sovereign Horizon Capital',
      titleAr: 'مطابقة التحويل البنكي 14,490 د.إ لشركة سوفيرين هورايزون',
      description: 'Verify credit in Emirates NBD corporate statement against invoice INV-000002.',
      category: 'payment_reminder',
      relatedEntityType: 'customer',
      relatedEntityId: 'CUS-000002',
      relatedEntityName: 'David Sterling',
      assignedToId: 'USR-004',
      assignedToName: 'Faisal Al-Hashimi',
      dueDate: '2026-08-26T16:00:00Z',
      priority: 'medium',
      status: 'pending',
      createdAt: '2026-08-25T11:30:00Z',
      updatedAt: '2026-08-25T11:30:00Z'
    },
    {
      id: 'TSK-000004',
      title: 'Porsche 911 GT3 RS Track Telemetry Service Completion',
      titleAr: 'استلام بورش 911 GT3 RS بعد اكتمال الصيانة',
      description: 'Collect vehicle from Porsche Centre Al Nabooda and verify brake pad wear percentage.',
      category: 'vehicle_maintenance',
      relatedEntityType: 'vehicle',
      relatedEntityId: 'VEH-0007',
      relatedEntityName: 'Porsche 911 GT3 RS (DXB P 992)',
      assignedToId: 'USR-005',
      assignedToName: 'Khalid Ben-Zayed',
      dueDate: '2026-08-28T12:00:00Z',
      priority: 'medium',
      status: 'pending',
      createdAt: '2026-08-24T09:00:00Z',
      updatedAt: '2026-08-24T09:00:00Z'
    }
  ];

  public communications: Communication[] = [
    {
      id: 'COMM-001',
      channel: 'whatsapp',
      direction: 'outbound',
      sender: 'Elena Rostova (Splendor VIP Relations)',
      recipient: '+971 50 999 8888 (H.E. Sheikh Mansoor Al Qasimi)',
      content: 'Your Highness, your bespoke Lamborghini Revuelto is confirmed for delivery on Thursday at 14:00. Attached is your official Splendor VIP reservation confirmation.',
      contentAr: 'سمو الشيخ، نود تأكيد حجز سيارة لامبورغيني ريفويلتو للتسليم يوم الخميس الساعة 14:00 في مقر إقامتكم. مرفق تأكيد الحجز الرسمي.',
      relatedEntityType: 'customer',
      relatedEntityId: 'CUS-000001',
      timestamp: '2026-08-25T16:45:00Z',
      createdById: 'USR-003',
      createdByName: 'Elena Rostova',
      deliveryStatus: 'read'
    },
    {
      id: 'COMM-002',
      channel: 'phone_call',
      direction: 'inbound',
      sender: 'David Sterling',
      recipient: '+971 52 444 5566 (Ahmed Morsy)',
      content: 'Called to confirm extension of Bentley Flying Spur contract until end of month. Confirmed wire transfer of remaining balance was initiated.',
      contentAr: 'اتصال هاتفي لتأكيد تمديد عقد بنتلي فلاينج سبير حتى نهاية الشهر وتأكيد إرسال الحوالة البنكية.',
      relatedEntityType: 'contract',
      relatedEntityId: 'CON-000002',
      timestamp: '2026-08-25T11:00:00Z',
      createdById: 'USR-002',
      createdByName: 'Ahmed Morsy'
    }
  ];

  public documents: CRMDocument[] = [
    {
      id: 'DOC-000001',
      title: 'Emirates ID & License — H.E. Sheikh Mansoor Al Qasimi',
      category: 'customer_id',
      fileName: 'Mansoor_AlQasimi_EID_License.pdf',
      fileSize: '2.4 MB',
      fileType: 'application/pdf',
      fileUrl: 'https://example.com/docs/eid_mansoor.pdf',
      relatedEntityType: 'customer',
      relatedEntityId: 'CUS-000001',
      relatedEntityName: 'H.E. Sheikh Mansoor Al Qasimi',
      expiryDate: '2028-11-15',
      version: 1,
      uploadedBy: 'Elena Rostova',
      uploadedAt: '2025-01-10T10:15:00Z'
    },
    {
      id: 'DOC-000002',
      title: 'Rolls-Royce Spectre Commercial Registration & Insurance',
      category: 'vehicle_insurance',
      fileName: 'Spectre_DXB1007_Mulkiya_Insurance.pdf',
      fileSize: '3.8 MB',
      fileType: 'application/pdf',
      fileUrl: 'https://example.com/docs/spectre_docs.pdf',
      relatedEntityType: 'vehicle',
      relatedEntityId: 'VEH-0001',
      relatedEntityName: 'Rolls-Royce Spectre (DXB VIP 1007)',
      expiryDate: '2027-03-31',
      version: 2,
      uploadedBy: 'Khalid Ben-Zayed',
      uploadedAt: '2025-03-30T14:00:00Z'
    },
    {
      id: 'DOC-000003',
      title: 'Rental Agreement CON-2026-00084 (Signed)',
      category: 'contract',
      fileName: 'CON-2026-00084_Kensington_Signed.pdf',
      fileSize: '1.9 MB',
      fileType: 'application/pdf',
      fileUrl: 'https://example.com/docs/con_000084.pdf',
      relatedEntityType: 'contract',
      relatedEntityId: 'CON-000001',
      relatedEntityName: 'CON-2026-00084',
      version: 1,
      uploadedBy: 'Ahmed Morsy',
      uploadedAt: '2026-08-23T10:15:00Z'
    }
  ];

  public documentTemplates: DocumentTemplate[] = [
    {
      id: 'TMPL-01',
      name: 'Splendor Luxury Quotation Standard',
      nameAr: 'نموذج عرض السعر الفاخر المعتمد',
      category: 'quotation',
      content: 'Bespoke Automotive Rental Proposal prepared for {{customer.name}} regarding {{vehicle.make}} {{vehicle.model}}. Total: {{pricing.grand_total}} AED.',
      contentAr: 'عرض سعر تأجير سيارة فاخرة مخصص للسيد/السيدة {{customer.name}} بخصوص {{vehicle.make}} {{vehicle.model}}. الإجمالي: {{pricing.grand_total}} د.إ.',
      variables: ['customer.name', 'vehicle.make', 'vehicle.model', 'dates.duration', 'pricing.daily_rate', 'pricing.grand_total', 'pricing.deposit'],
      isDefault: true,
      updatedAt: '2026-08-01T00:00:00Z'
    },
    {
      id: 'TMPL-02',
      name: 'Splendor Master Rental Contract (UAE Legal Form)',
      nameAr: 'عقد تأجير المركبات الفاخرة الرئيسي',
      category: 'rental_contract',
      content: 'This Rental Agreement is made between SPLENDOR CAR RENTAL LLC and {{customer.name}} (ID: {{customer.id_number}}) for the lease of {{vehicle.make}} {{vehicle.model}} (Plate: {{vehicle.plate_number}}).',
      contentAr: 'تم إبرام هذا العقد بين شركة سبليندور لتأجير السيارات ذ.م.م والعميل {{customer.name}} (رقم الهوية: {{customer.id_number}}) لتأجير المركبة {{vehicle.make}} {{vehicle.model}} (رقم اللوحة: {{vehicle.plate_number}}).',
      variables: ['contract.number', 'customer.name', 'customer.id_number', 'vehicle.make', 'vehicle.model', 'vehicle.plate_number', 'dates.start', 'dates.end', 'pricing.grand_total'],
      isDefault: true,
      updatedAt: '2026-08-01T00:00:00Z'
    }
  ];

  public auditLogs: AuditLog[] = [
    {
      id: 'AUD-000001',
      userId: 'USR-003',
      userName: 'Elena Rostova',
      userRole: 'sales',
      entityType: 'Reservation',
      entityId: 'RES-000001',
      action: 'create',
      newValue: 'Confirmed reservation for H.E. Sheikh Mansoor Al Qasimi (Lamborghini Revuelto)',
      reason: 'Quotation QT-000001 accepted by royal protocol office',
      timestamp: '2026-08-25T16:00:00Z'
    },
    {
      id: 'AUD-000002',
      userId: 'USR-004',
      userName: 'Faisal Al-Hashimi',
      userRole: 'finance',
      entityType: 'BankReconciliation',
      entityId: 'BTX-002',
      action: 'reconcile',
      previousValue: 'Status: Suggested Match (44,625 AED)',
      newValue: 'Status: Approved & Reconciled with Receipt RCP-2026-00109',
      reason: 'Matched Stripe online transaction with invoice INV-000001',
      timestamp: '2026-08-24T18:00:00Z'
    },
    {
      id: 'AUD-000003',
      userId: 'USR-002',
      userName: 'Ahmed Morsy',
      userRole: 'operations',
      entityType: 'Contract',
      entityId: 'CON-000001',
      action: 'status_change',
      previousValue: 'Status: Draft',
      newValue: 'Status: Active (Vehicle Handover Completed with 0 new damages)',
      reason: 'Handover inspection signed at Bulgari Resort',
      timestamp: '2026-08-23T10:15:00Z'
    }
  ];

  public customFields: CustomFieldDefinition[] = [
    {
      id: 'CF-01',
      entityType: 'customer',
      label: 'VIP Chauffeur Preference',
      labelAr: 'تفضيل السائق الخاص VIP',
      key: 'vip_chauffeur_preference',
      type: 'dropdown',
      options: ['Self-Drive Only', 'Dedicated Chauffeur Required', 'Optional On-Call'],
      required: false,
      active: true
    },
    {
      id: 'CF-02',
      entityType: 'vehicle',
      label: 'Exhaust Sound Profile',
      labelAr: 'نغمة العادم الرياضية',
      key: 'exhaust_sound_profile',
      type: 'dropdown',
      options: ['Titanium Sport Exhaust', 'Silent Electric', 'OEM Valvetronic'],
      required: false,
      active: true
    }
  ];

  public numberingConfigs: NumberingConfig[] = [
    { entity: 'Customer', prefix: 'CUS-', digits: 6, nextNumber: 5, sample: 'CUS-000005' },
    { entity: 'Lead', prefix: 'LEAD-', digits: 6, nextNumber: 5, sample: 'LEAD-000005' },
    { entity: 'Quotation', prefix: 'QT-', digits: 6, nextNumber: 2, sample: 'QT-000002' },
    { entity: 'Reservation', prefix: 'RES-', digits: 6, nextNumber: 3, sample: 'RES-000003' },
    { entity: 'Contract', prefix: 'CON-2026-', digits: 5, nextNumber: 86, sample: 'CON-2026-00086' },
    { entity: 'Invoice', prefix: 'INV-', digits: 6, nextNumber: 3, sample: 'INV-000003' },
    { entity: 'Payment', prefix: 'PAY-', digits: 6, nextNumber: 3, sample: 'PAY-000003' },
    { entity: 'Receipt', prefix: 'RCP-2026-', digits: 5, nextNumber: 111, sample: 'RCP-2026-00111' },
    { entity: 'Deposit', prefix: 'DEP-', digits: 6, nextNumber: 4, sample: 'DEP-000004' },
    { entity: 'Task', prefix: 'TSK-', digits: 6, nextNumber: 5, sample: 'TSK-000005' }
  ];

  public notifications: NotificationItem[] = [
    {
      id: 'NOTIF-01',
      type: 'critical',
      title: 'High-Value Bank Wire Pending Review',
      titleAr: 'تحويل بنكي عالي القيمة بانتظار الاعتماد',
      message: '14,490 AED wire received from Sovereign Horizon Capital matched with 98% AI confidence.',
      messageAr: 'تم استلام تحويل بمبلغ 14,490 د.إ من شركة سوفيرين هورايزون بنسبة تطابق ذكي 98%.',
      link: '/bank-reconciliation',
      read: false,
      timestamp: '2026-08-25T11:05:00Z'
    },
    {
      id: 'NOTIF-02',
      type: 'important',
      title: 'Rolls-Royce Spectre Contract Expiring in 48 Hours',
      titleAr: 'عقد رولز رويس سبيكتر ينتهي خلال 48 ساعة',
      message: 'Lady Genevieve Kensington rental finishes on Aug 28. Review extension request or prep return inspection.',
      messageAr: 'ينتهي إيجار الليدي جينيفيف كنسينغتون في 28 أغسطس. يرجى مراجعة طلب التمديد أو جدولة الاستلام.',
      link: '/rental-operations',
      read: false,
      timestamp: '2026-08-25T09:00:00Z'
    },
    {
      id: 'NOTIF-03',
      type: 'informational',
      title: 'Royal Reservation Confirmed',
      titleAr: 'تم تأكيد الحجز الملكي',
      message: 'Lamborghini Revuelto confirmed for H.E. Sheikh Mansoor Al Qasimi with enclosed delivery.',
      messageAr: 'تم تأكيد حجز لامبورغيني ريفويلتو لسمو الشيخ منصور القاسمي مع التوصيل بالناقلة المغلقة.',
      link: '/reservations',
      read: true,
      timestamp: '2026-08-25T16:00:00Z'
    }
  ];

  // Helper Methods for Single Source of Truth
  public logAudit(log: Omit<AuditLog, 'id' | 'timestamp'>) {
    const newLog: AuditLog = {
      ...log,
      id: `AUD-${String(this.auditLogs.length + 1).padStart(6, '0')}`,
      timestamp: new Date().toISOString()
    };
    this.auditLogs.unshift(newLog);
    return newLog;
  }

  public getNextNumber(entityName: string): string {
    const config = this.numberingConfigs.find(c => c.entity.toLowerCase() === entityName.toLowerCase());
    if (!config) return `${entityName.toUpperCase().slice(0, 3)}-${Date.now()}`;
    const num = config.nextNumber;
    config.nextNumber += 1;
    config.sample = `${config.prefix}${String(config.nextNumber).padStart(config.digits, '0')}`;
    return `${config.prefix}${String(num).padStart(config.digits, '0')}`;
  }

  public getSystemHealth(): SystemHealth {
    return {
      status: 'healthy',
      databaseLatencyMs: 14,
      activeSessions: 8,
      apiAvailabilityPercent: 99.98,
      failedJobsCount: 0,
      failedImportsCount: 0,
      pendingReconciliationsCount: this.bankTransactions.filter(t => !t.reconciled).length,
      lastBackupAt: '2026-08-26T00:00:00Z',
      uptimeSeconds: 864000
    };
  }

  // Duplicate customer detection
  public findDuplicateCustomers(email: string, phone: string, licenseNumber?: string, idNumber?: string) {
    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    return this.customers.filter(c => {
      const cPhone = c.phone.replace(/[^0-9]/g, '');
      const emailMatch = c.email.toLowerCase() === email.toLowerCase();
      const phoneMatch = normalizedPhone.length > 6 && cPhone.endsWith(normalizedPhone.slice(-7));
      const licenseMatch = licenseNumber && c.licenseNumber.toLowerCase() === licenseNumber.toLowerCase();
      const idMatch = idNumber && c.idNumber.toLowerCase() === idNumber.toLowerCase();
      return emailMatch || phoneMatch || licenseMatch || idMatch;
    });
  }

  // Vehicle Availability Engine
  public checkVehicleAvailability(vehicleId: string, startDateStr: string, endDateStr: string, excludeReservationId?: string): { available: boolean; conflictingRecords: any[] } {
    const targetStart = new Date(startDateStr).getTime();
    const targetEnd = new Date(endDateStr).getTime();
    const conflicts: any[] = [];

    const vehicle = this.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return { available: false, conflictingRecords: ['Vehicle not found'] };

    if (vehicle.status === 'maintenance' || vehicle.status === 'unavailable') {
      conflicts.push({ type: 'status_block', message: `Vehicle is currently marked as ${vehicle.status}` });
    }

    // Check active contracts
    this.contracts.forEach(c => {
      if (c.vehicleId === vehicleId && c.status === 'active') {
        const cStart = new Date(c.startDateTime).getTime();
        const cEnd = new Date(c.endDateTime).getTime();
        if (targetStart <= cEnd && targetEnd >= cStart) {
          conflicts.push({ type: 'active_contract', id: c.id, contractNumber: c.contractNumber, customer: c.customerName });
        }
      }
    });

    // Check existing confirmed/active reservations
    this.reservations.forEach(r => {
      if (r.id === excludeReservationId) return;
      if (r.vehicleId === vehicleId && (r.status === 'confirmed' || r.status === 'active')) {
        const rStart = new Date(r.pickupDateTime).getTime();
        const rEnd = new Date(r.returnDateTime).getTime();
        if (targetStart <= rEnd && targetEnd >= rStart) {
          conflicts.push({ type: 'reservation', id: r.id, customer: r.customerName, dates: `${r.pickupDateTime} - ${r.returnDateTime}` });
        }
      }
    });

    return {
      available: conflicts.length === 0,
      conflictingRecords: conflicts
    };
  }

  // Generate complete statement for customer
  public getCustomerStatement(customerId: string): any {
    const customer = this.customers.find(c => c.id === customerId);
    if (!customer) return null;

    const invoices = this.invoices.filter(i => i.customerId === customerId);
    const payments = this.payments.filter(p => p.customerId === customerId);
    const deposits = this.deposits.filter(d => d.customerId === customerId);
    const charges = this.charges.filter(ch => ch.customerId === customerId);

    const entries: any[] = [];
    let runningBalance = 0;

    // Collate all transactions
    invoices.forEach(inv => {
      runningBalance += inv.totalAmount;
      entries.push({
        id: `stmt-${inv.id}`,
        date: inv.issueDate,
        type: 'invoice',
        reference: inv.id,
        description: `Rental Invoice ${inv.id}`,
        debit: inv.totalAmount,
        credit: 0,
        runningBalance
      });
    });

    payments.forEach(pay => {
      runningBalance -= pay.amount;
      entries.push({
        id: `stmt-${pay.id}`,
        date: pay.receivedAt.split('T')[0],
        type: 'payment',
        reference: pay.receiptNumber || pay.id,
        description: `Payment Received (${(pay.method || 'cash').toUpperCase()} - Ref: ${pay.referenceNumber || 'N/A'})`,
        debit: 0,
        credit: pay.amount,
        runningBalance
      });
    });

    charges.forEach(ch => {
      runningBalance += ch.totalAmount;
      entries.push({
        id: `stmt-${ch.id}`,
        date: ch.timestamp.split('T')[0],
        type: 'debit',
        reference: ch.id,
        description: `Additional Charge: ${ch.description}`,
        debit: ch.totalAmount,
        credit: 0,
        runningBalance
      });
    });

    deposits.forEach(dep => {
      entries.push({
        id: `stmt-${dep.id}`,
        date: dep.createdAt.split('T')[0],
        type: 'deposit_in',
        reference: dep.id,
        description: `Security Deposit Held (${dep.status})`,
        debit: 0,
        credit: 0,
        runningBalance
      });
    });

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalInvoiced = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const totalDepositsHeld = deposits.filter(d => d.status === 'held').reduce((s, d) => s + d.balance, 0);

    return {
      customerId: customer.id,
      customerName: customer.fullName,
      customerNameAr: customer.fullNameAr,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      periodStart: '2026-01-01',
      periodEnd: new Date().toISOString().split('T')[0],
      openingBalance: 0,
      totalInvoiced,
      totalPaid,
      totalDepositsHeld,
      closingBalance: totalInvoiced - totalPaid,
      entries,
      generatedAt: new Date().toISOString()
    };
  }
}

export const globalStore = new DataStore();
