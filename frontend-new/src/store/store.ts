import { configureStore, combineReducers } from '@reduxjs/toolkit';
import storage from 'redux-persist/lib/storage'; // Используем localStorage
import {
  persistReducer,
  persistStore,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import authReducer from './authSlice';
import themeReducer from './themeSlice';

// Объединяем все редьюсеры в один корневой редьюсер
const rootReducer = combineReducers({
  auth: authReducer,
  theme: themeReducer,
  // Если в будущем появятся другие редьюсеры, их нужно будет добавить сюда
});

// Конфигурация для сохранения
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth', 'theme'], // Указываем, какой "слайс" состояния нужно сохранять
};

// Создаем "персистентный" редьюсер, который оборачивает наш корневой редьюсер
const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  // Используем наш новый персистентный редьюсер
  reducer: persistedReducer,
  // Отключаем проверку на сериализуемость для redux-persist
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

// Создаем persistor
export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;