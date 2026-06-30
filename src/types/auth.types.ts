// src/types/auth.types.ts
import { Models } from 'appwrite';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  name: string;
}

export interface UserSession {
  session: Models.Session;
  user: Models.User<Models.Preferences>;
}
