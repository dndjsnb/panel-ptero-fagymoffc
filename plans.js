module.exports = {
    "1gb": {
        name: "Server 1GB",
        price: 5000,
        limits: { memory: 1024, swap: 0, disk: 512, io: 500, cpu: 30 },
        feature_limits: { databases: 1, backups: 1, allocations: 1 },
        egg_id: 1, 
        docker_image: "ghcr.io/pterodactyl/yolks:java_17",
        startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}"
    }
};

