module.exports = {
    settings: {
        runtime: {
            port: 8080,
            serve: 'files',
            favicon: 'files/roc.png'
        },
        build: {
            entry: {
                client: 'client.js',
                server: 'server.js'
            }
        },
        dev: {
            open: true
        }
    }
};
