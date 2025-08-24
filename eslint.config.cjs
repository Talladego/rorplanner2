// Flat config for ESLint v9+ (TypeScript + React + JSX A11y + Prettier)
module.exports = [
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: require.resolve('@typescript-eslint/parser'),
			parserOptions: {
				ecmaFeatures: { jsx: true },
				ecmaVersion: 'latest',
				sourceType: 'module',
			},
		},
		plugins: {
			'@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
			react: require('eslint-plugin-react'),
			'react-hooks': require('eslint-plugin-react-hooks'),
			'jsx-a11y': require('eslint-plugin-jsx-a11y'),
		},
		settings: { react: { version: 'detect' } },
		rules: Object.assign({},
			require('eslint/lib/rules').rules || {},
			require('eslint-plugin-react').rules || {},
			require('@typescript-eslint/eslint-plugin').configs.recommended.rules || {},
			require('eslint-plugin-react-hooks').rules || {},
			require('eslint-plugin-jsx-a11y').rules || {}
		),
	},
	// general JS rules
	{
		files: ['**/*.{js,cjs,mjs}'],
		languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
	},
]
