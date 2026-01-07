/**
 * Hierarchical Location Data for Islamic Reminders
 * Structure: Country -> Governorate -> City/Area -> { lat, lng }
 */

const LOCATION_DATA = {
    "Egypt": {
        "Cairo": {
            "Cairo": { lat: 30.0444, lng: 31.2357 },
            "Nasr City": { lat: 30.0561, lng: 31.3301 },
            "Maadi": { lat: 29.9593, lng: 31.2580 },
            "Heliopolis": { lat: 30.0898, lng: 31.3283 },
            "New Cairo": { lat: 30.0279, lng: 31.4795 },
            "6th of October": { lat: 29.9722, lng: 30.9575 },
            "Sheikh Zayed": { lat: 30.0401, lng: 30.9850 }
        },
        "Giza": {
            "Giza": { lat: 30.0131, lng: 31.2089 },
            "Faisal": { lat: 30.0075, lng: 31.1444 },
            "Haram": { lat: 29.9961, lng: 31.1309 },
            "Dokki": { lat: 30.0392, lng: 31.2093 }
        },
        "Alexandria": {
            "lexandria": { lat: 31.2001, lng: 29.9187 },
            "Borg El Arab": { lat: 30.8524, lng: 29.6974 },
            "Agami": { lat: 31.1189, lng: 29.7719 }
        },
        "Qalyubia": {
            "Banha": { lat: 30.4623, lng: 31.1786 },
            "Qalyub": { lat: 30.1782, lng: 31.2081 },
            "Shubra Al Khaymah": { lat: 30.1256, lng: 31.2422 }
        },
        "Gharbia": {
            "Tanta": { lat: 30.7865, lng: 31.0004 },
            "Mahalla Al Kubra": { lat: 30.9686, lng: 31.1648 }
        },
        "Dakahlia": {
            "Mansoura": { lat: 31.0409, lng: 31.3785 },
            "Mit Ghamr": { lat: 30.7169, lng: 31.2682 }
        },
        "Sharqia": {
            "Zagazig": { lat: 30.5877, lng: 31.5020 },
            "10th of Ramadan": { lat: 30.3015, lng: 31.7431 }
        },
        "Monufia": {
            "Shibin El Kom": { lat: 30.5562, lng: 31.0088 },
            "Menouf": { lat: 30.4682, lng: 30.9329 }
        },
        "Beheira": {
            "Damanhur": { lat: 31.0371, lng: 30.4735 },
            "Kafr El Dawwar": { lat: 31.1341, lng: 30.1293 }
        },
        "Kafr El Sheikh": {
            "Kafr El Sheikh": { lat: 31.1077, lng: 30.9422 },
            "Desouk": { lat: 31.1332, lng: 30.6475 }
        },
        "Damietta": {
            "Damietta": { lat: 31.4175, lng: 31.8144 },
            "New Damietta": { lat: 31.4284, lng: 31.6625 }
        },
        "Port Said": {
            "Port Said": { lat: 31.2653, lng: 32.3020 },
            "Port Fouad": { lat: 31.2500, lng: 32.3216 }
        },
        "Ismailia": {
            "Ismailia": { lat: 30.5965, lng: 32.2715 },
            "Fayed": { lat: 30.3292, lng: 32.3027 }
        },
        "Suez": {
            "Suez": { lat: 29.9668, lng: 32.5498 }
        },
        "Faiyum": {
            "Faiyum": { lat: 29.3084, lng: 30.8428 }
        },
        "Beni Suef": {
            "Beni Suef": { lat: 29.0661, lng: 31.0994 }
        },
        "Minya": {
            "Minya": { lat: 28.1130, lng: 30.7505 }
        },
        "Asyut": {
            "Asyut": { lat: 27.1783, lng: 31.1859 }
        },
        "Sohag": {
            "Sohag": { lat: 26.5590, lng: 31.6957 }
        },
        "Qena": {
            "Qena": { lat: 26.1524, lng: 32.7212 }
        },
        "Luxor": {
            "Luxor": { lat: 25.6872, lng: 32.6396 }
        },
        "Aswan": {
            "Aswan": { lat: 24.0889, lng: 32.8998 }
        },
        "Red Sea": {
            "Hurghada": { lat: 27.2579, lng: 33.8116 },
            "Safaga": { lat: 26.7460, lng: 33.9350 }
        },
        "South Sinai": {
            "Sharm El Sheikh": { lat: 27.9158, lng: 34.3299 },
            "Dahab": { lat: 28.5096, lng: 34.5135 }
        },
        "North Sinai": {
            "Arish": { lat: 31.1321, lng: 33.8033 }
        },
        "Matrouh": {
            "Marsa Matrouh": { lat: 31.3543, lng: 27.2373 }
        },
        "New Valley": {
            "Kharga": { lat: 25.4390, lng: 30.5586 }
        }
    },
    "Saudi Arabia": {
        "Riyadh": {
            "Riyadh": { lat: 24.7136, lng: 46.6753 }
        },
        "Makkah": {
            "Makkah": { lat: 21.3891, lng: 39.8579 },
            "Jeddah": { lat: 21.4858, lng: 39.1925 }
        },
        "Madinah": {
            "Madinah": { lat: 24.5247, lng: 39.5692 }
        },
        "Eastern Province": {
            "Dammam": { lat: 26.4207, lng: 50.0888 },
            "Khobar": { lat: 26.2172, lng: 50.1971 }
        }
    },
    "UAE": {
        "Dubai": {
            "Dubai": { lat: 25.2048, lng: 55.2708 }
        },
        "Abu Dhabi": {
            "Abu Dhabi": { lat: 24.4539, lng: 54.3773 }
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LOCATION_DATA;
}
