import { createConfigForNuxt } from '@nuxt/eslint-config'

export default createConfigForNuxt({
    features: {
        stylistic: true,
    },
}).append({
    ignores: [
        '.output/**',
        '.nuxt/**',
        '.test-doc/**',
        'public/**',
        'node_modules/**',
        '.eslintcache',
    ],
    rules: {
        'comma-dangle': ['error', 'always-multiline'],
        quotes: ['error', 'single'],
        semi: ['error', 'never'],
        '@stylistic/arrow-parens': ['error', 'as-needed'],
        'object-shorthand': ['error', 'always'],
        '@stylistic/indent': ['error', 4],
        '@stylistic/quote-props': ['error', 'as-needed'],
        'vue/html-indent': ['error', 4],
        'vue/multi-word-component-names': 'off',
        'vue/no-template-shadow': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-expressions': 'off',
        'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
        'no-async-promise-executor': 'off',
        '@stylistic/max-statements-per-line': 'off',
        'no-useless-assignment': 'off',
        'no-useless-escape': 'off',
    },
})
