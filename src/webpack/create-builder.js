import { getDevPath } from './utils/dev';
import webpack from 'webpack';
import path from 'path';

import autoprefixer from 'autoprefixer';
import ExtractTextPlugin from 'extract-text-webpack-plugin';
import BrowserSyncPlugin from 'browser-sync-webpack-plugin';
import writeStats from './utils/write-stats';

const bourbon = './node_modules/bourbon/app/assets/stylesheets/';
const neat = './node_modules/bourbon-neat/app/assets/stylesheets/';

/* resolver: should be a path to a file that will return the final new NODE_PATH
 */
export default function createBuilder(options, resolver = 'roc-web/lib/get-resolve-path') {
    const allowedModes = ['dev', 'test', 'dist'];
    const allowedTargets = ['server', 'client'];

    if (allowedModes.indexOf(options.mode) === -1) {
        throw new Error(`Invalid mode, must be one of ${allowedModes}. Was instead ${options.mode}.`);
    }

    if (allowedTargets.indexOf(options.target) === -1) {
        throw new Error(`Invalid target, must be one of ${allowedTargets}. Was instead ${options.target}.`);
    }

    if (!options.outputPath) {
        throw new Error('A output path needs to be defined in the options.');
    }

    const DEV = (options.mode === 'dev');
    const TEST = (options.mode === 'test');
    const DIST = (options.mode === 'dist');

    const SERVER = (options.target === 'server');
    const CLIENT = (options.target === 'client');

    const ENV = DIST ? 'production' : 'development';

    let webpackConfig = {};

    webpackConfig.bail = true;

    /**
    * Entry
    */
    if (SERVER) {
        webpackConfig.entry = {
            app: [
                require.resolve('../../app/server-entry')
            ]
        };
    }

    /**
    * Target
    */
    if (SERVER) {
        webpackConfig.target = 'node';
    }

    const devPath = getDevPath({
        buildPath: options.outputPath
    });

    if (SERVER) {
        webpackConfig.externals = [
            {
                [resolver]: true
            },
            function(context, request, callback) {
                // If a roc module include it in the bundle
                if (request.substr(0, 4) === 'roc-') {
                    return callback();
                }

                // If a normal node_module mark it as external
                if (/^[a-zA-Z\-0-9]{1}.*$/.test(request)) {
                    return callback(null, true);
                }

                // Everything else should be included, that will be relative and absolute paths
                callback();
            }
        ];
    }

    /**
    * Devtool
    *
    * TODO: Consider tweaking this option & handle production correct
    * We want the source map files to be stored on a seperate server.
    */
    if (CLIENT && DEV) {
        webpackConfig.devtool = 'cheap-module-inline-source-map';
    } else if (CLIENT && TEST) {
        webpackConfig.devtool = 'inline-source-map';
    } else {
        webpackConfig.devtool = 'source-map';
    }

    /**
    * Output
    */
    if (TEST) {
        webpackConfig.output = {};
    } else {
        webpackConfig.output = {
            path: options.outputPath.absolute,
            publicPath: DIST ? '/' : devPath,
            filename: (DIST && CLIENT) ? '[name].[hash].js' : '[name].bundle.js',
            chunkFilename: (DIST && CLIENT) ? '[name].[hash].js' : '[name].bundle.js'
        };
    }

    if (SERVER) {
        webpackConfig.output.libraryTarget = 'commonjs2';
    }

    if (CLIENT && DEV) {
        webpackConfig.output.filename = '[name].client.bundle.js';
    }

    /**
    * Loaders
    */

    // Base
    webpackConfig.module = {
        preLoaders: [],
        loaders: []
    };

    // ISPARTA LOADER
    if (TEST) {
        webpackConfig.module.loaders.push({
            test: /\.js$/,
            loader: 'babel-loader',
            // FIXME
            include: [
                /tests/,
                /karma/
            ]
        });
        webpackConfig.module.preLoaders.push({
            test: /\.js$/,
            loader: 'isparta-loader',
            // FIXME
            exclude: [
                /node_modules/,
                /tests/,
                /karma/,
                /src\/vendor/
            ]
        });
    }

    // JS LOADER
    const jsLoader = {
        test: /\.js$/,
        loader: 'babel-loader',
        include: function(absPath) {
            /* This function will look at the absolute path for the current file
             * to determine if it should be processed by the babel-loader.
             *
             * What this does exactly is that is finds the last match of "roc-X/SOMETHING".
             * If SOMETHING is "node_modules" it will ignore it otherwise process it using
             * babel.
             */
            const regexp = /(roc-[^/]*)\/([^/]*)/g;
            let match, matches = [];
            while ((match = regexp.exec(absPath))) {
                matches.push({ roc: match[0], next: match[1] });
            }
            const last = matches[matches.length - 1];
            if (last.next !== 'node_modules') {
                // We want to process this with babel-loader
                return true;
            }
        },
        exclude: [
            /node_modules/
        ]
    };

    if (!TEST) {
        webpackConfig.module.loaders.push(jsLoader);
    }

    // STYLE LOADER
    const styleLoader = {
        test: /\.scss$/
    };

    // JSON LOADER
    const jsonLoader = {
        test: /\.json$/,
        loader: 'json-loader'
    };

    let styleLoaders = 'css-loader';

    if (SERVER) {
        styleLoaders += '/locals';
    }

    styleLoaders += '?sourceMap&module&importLoaders=1&localIdentName=';

    // Define how the class names should be defined
    if (DIST) {
        styleLoaders += '[hash:base64:5]';
    } else {
        styleLoaders += '[path]_[name]__[local]___[hash:base64:5]';
    }

    // We can add an external sass dependecie here.
    styleLoaders += '!postcss!sass?sourceMap&' +
    'includePaths[]=' + bourbon + '&' +
    'includePaths[]=' + neat;

    if (CLIENT) {
        styleLoaders = ExtractTextPlugin.extract('style', styleLoaders);
    }

    styleLoader.loader = styleLoaders;

    webpackConfig.module.loaders.push(styleLoader);

    // Post CSS webpackConfig
    webpackConfig.postcss = [
        autoprefixer({
            browsers: ['last 2 version']
        })
    ];

    // FILE LOADERS
    webpackConfig.module.loaders.push({
        test: /\.(png|svg)$/,
        loader: 'url-loader?limit=100000'
    });

    webpackConfig.module.loaders.push({
        test: /\.(jpg)$/,
        loader: 'file-loader'
    });

    webpackConfig.module.loaders.push(jsonLoader);

    /**
    * Resolve
    */
    webpackConfig.resolve = {
        fallback: [
            path.join(__dirname, '../../node_modules')
        ],
        extensions: ['', '.js', '.css', '.scss']
    };

    webpackConfig.resolveLoader = {
        root: [
            path.join(process.cwd(), 'node_modules'),
            path.join(__dirname, '../../node_modules')
        ]
    };

    /**
    * Plugins
    */
    webpackConfig.plugins = [];

    if (CLIENT) {
        webpackConfig.plugins.push(
            new webpack.IgnorePlugin(/^config$/)
        );
    }

    webpackConfig.plugins.push(
        new ExtractTextPlugin('[name].[hash].css', {
            disable: CLIENT && DEV
        })
    );

    webpackConfig.plugins.push(
        // process.env.NODE_ENV is used by React and some other libs to determine what to run
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(ENV),
            '__DEV__': DEV,
            '__TEST__': TEST,
            '__DIST__': DIST,
            '__SERVER__': SERVER,
            '__CLIENT__': CLIENT,
            'ROC_SERVER_ENTRY': JSON.stringify(options.entry),
            'ROC_PATH_RESOLVER': JSON.stringify(resolver)
        })
    );

    if (DIST) {
        webpackConfig.plugins.push(function() {
            this.plugin('done', writeStats);
        });
    }

    if (DEV && CLIENT) {
        webpackConfig.plugins.push(
            new webpack.optimize.OccurenceOrderPlugin(),
            new webpack.HotModuleReplacementPlugin(),
            new webpack.NoErrorsPlugin()
        );
    }

    if (DIST) {
        webpackConfig.plugins.push(
            new webpack.optimize.DedupePlugin(),
            new webpack.optimize.OccurenceOrderPlugin()
        );
    }

    if (DIST && CLIENT) {
        webpackConfig.plugins.push(
            new webpack.optimize.UglifyJsPlugin({
                /* eslint-disable */
                compress: {
                    warnings: false,
                    screw_ie8: true,
                    drop_debugger: true
                }
                /* eslint-enable */
            })
        );
    }

    // FIXME
    if (CLIENT && DEV && !TEST) {
        webpackConfig.plugins.push(
            new BrowserSyncPlugin({
                host: 'localhost',
                port: 3002,
                logFileChanges: false,
                ui: {
                    port:3003
                }
            }, {
                reload: false
            })
        );
    }

    return {
        config: webpackConfig,
        build: webpack
    };
}