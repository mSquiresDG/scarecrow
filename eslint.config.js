import tsParser from '@typescript-eslint/parser';
import noDefaultClassFields from './node_modules/genesys.js/eslint-rules/no-default-class-fields.js';
import defaultGetterReturnType from './node_modules/genesys.js/eslint-rules/default-getter-return-type.js';
import constructorTypeConsistency from './node_modules/genesys.js/eslint-rules/constructor-type-consistency.js';
import noOverrideMethods from './node_modules/genesys.js/eslint-rules/no-override-methods.js';


export default [
  {
    ignores: ['dist/**', '.engine/**', 'node_modules/**']
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json']
      }
    },
    plugins: {
      'custom': {
        rules: {
          'no-override-methods': noOverrideMethods,
          'no-default-class-fields': noDefaultClassFields,
          'default-getter-return-type': defaultGetterReturnType,
          'constructor-type-consistency': constructorTypeConsistency,          
        }
      }
    },
    rules: {
      'custom/no-override-methods': 'error',
      'custom/no-default-class-fields': 'error',
      'custom/default-getter-return-type': 'error',
      'custom/constructor-type-consistency': 'error',      
    }
  },
  {
    files: ['games/**/*.ts', 'games/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['../src/**', '!../src/index.js']
      }]
    }
  }
];
