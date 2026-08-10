// Konfigurasi Standar Pterodactyl untuk Node/Egg
// Pastikan egg_id sesuai dengan ID Egg di panel lu (misal 1 untuk Minecraft)
const defaultConfig = {
    io: 500,
    swap: 0,
    egg_id: 1, 
    docker_image: "ghcr.io/pterodactyl/yolks:java_17",
    startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"
};

module.exports = {
    "1gb": {
        name: "Server 1GB",
        price: 5000,
        limits: { memory: 1024, swap: defaultConfig.swap, disk: 512, io: defaultConfig.io, cpu: 30 },
        feature_limits: { databases: 1, backups: 1, allocations: 1 },
        ...defaultConfig
    },
    "2gb": {
        name: "Server 2GB",
        price: 10000,
        limits: { memory: 2048, swap: defaultConfig.swap, disk: 1024, io: defaultConfig.io, cpu: 60 },
        feature_limits: { databases: 1, backups: 1, allocations: 1 },
        ...defaultConfig
    },
    "3gb": {
        name: "Server 3GB",
        price: 15000,
        limits: { memory: 3072, swap: defaultConfig.swap, disk: 1536, io: defaultConfig.io, cpu: 90 },
        feature_limits: { databases: 2, backups: 1, allocations: 1 },
        ...defaultConfig
    },
    "4gb": {
        name: "Server 4GB",
        price: 20000,
        limits: { memory: 4096, swap: defaultConfig.swap, disk: 2048, io: defaultConfig.io, cpu: 120 },
        feature_limits: { databases: 2, backups: 2, allocations: 1 },
        ...defaultConfig
    },
    "5gb": {
        name: "Server 5GB",
        price: 25000,
        limits: { memory: 5120, swap: defaultConfig.swap, disk: 2560, io: defaultConfig.io, cpu: 150 },
        feature_limits: { databases: 3, backups: 2, allocations: 2 },
        ...defaultConfig
    },
    "6gb": {
        name: "Server 6GB",
        price: 30000,
        limits: { memory: 6144, swap: defaultConfig.swap, disk: 3072, io: defaultConfig.io, cpu: 180 },
        feature_limits: { databases: 3, backups: 3, allocations: 2 },
        ...defaultConfig
    },
    "7gb": {
        name: "Server 7GB",
        price: 35000,
        limits: { memory: 7168, swap: defaultConfig.swap, disk: 3584, io: defaultConfig.io, cpu: 210 },
        feature_limits: { databases: 4, backups: 3, allocations: 2 },
        ...defaultConfig
    },
    "8gb": {
        name: "Server 8GB",
        price: 40000,
        limits: { memory: 8192, swap: defaultConfig.swap, disk: 4096, io: defaultConfig.io, cpu: 240 },
        feature_limits: { databases: 4, backups: 4, allocations: 2 },
        ...defaultConfig
    },
    "9gb": {
        name: "Server 9GB",
        price: 45000,
        limits: { memory: 9216, swap: defaultConfig.swap, disk: 4608, io: defaultConfig.io, cpu: 270 },
        feature_limits: { databases: 5, backups: 4, allocations: 3 },
        ...defaultConfig
    },
    "10gb": {
        name: "Server 10GB",
        price: 50000,
        limits: { memory: 10240, swap: defaultConfig.swap, disk: 5120, io: defaultConfig.io, cpu: 300 },
        feature_limits: { databases: 5, backups: 5, allocations: 3 },
        ...defaultConfig
    },
    "unlimited": {
        name: "Server Max/Unlimited",
        price: 100000,
        // Rahasia Unlimited Pterodactyl: Set nilai menjadi 0
        limits: { 
            memory: 0,  // Unlimited RAM
            swap: 0, 
            disk: 0,    // Unlimited Disk
            io: 500, 
            cpu: 0      // Unlimited CPU
        },
        feature_limits: { 
            databases: null, // Unlimited Database
            backups: null,   // Unlimited Backup
            allocations: 5   // Port alokasi tetep gw batasin 5 biar IP lu nggak habis, bebas edit kalau mau
        },
        ...defaultConfig
    }
};
                         
