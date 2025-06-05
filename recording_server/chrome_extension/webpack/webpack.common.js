const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const srcDir = path.join(__dirname, '..', 'src')

module.exports = {
    entry: {
        background: path.join(srcDir, 'background.ts'),
        observeSpeakers: path.join(srcDir, 'observeSpeakers.ts'),
        shittyHtml: path.join(srcDir, 'shittyHtml.ts'),
    },
    output: {
        path: path.join(__dirname, '../dist/js'),
        filename: '[name].js',
    },
    performance: {
        maxEntrypointSize: 512000,
        maxAssetSize: 512000,
    },
    optimization: {
        splitChunks: {
            name: 'vendor',
            chunks: 'initial',
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: '.', to: '..', context: 'public' }],
            options: {},
        }),
    ],
}
