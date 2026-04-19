module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
            '@em/shared': '../shared/src',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
