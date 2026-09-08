import { prisma } from '../../config/database.js';
import { hashPassword, comparePassword } from '../../common/utils/password.util.js';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
} from '../../common/utils/token.util.js';
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/app-error.js';
import { LoginInput, RegisterInput } from './auth.schemas.js';
import { Role } from '@prisma/client';

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthSessionResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  async login(input: LoginInput): Promise<AuthSessionResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const { rawToken, tokenHash, expiresAt } = generateRefreshToken();

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      accessToken,
      refreshToken: rawToken,
    };
  }

  async refreshTokens(rawRefreshToken: string): Promise<TokenRefreshResponse> {
    const hashed = hashToken(rawRefreshToken);

    return prisma.$transaction(async (tx) => {
      // Atomic conditional update: only the first concurrent request can revoke this token
      const updateResult = await tx.refreshToken.updateMany({
        where: {
          tokenHash: hashed,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: {
          revokedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        // Token was either already revoked, expired, or non-existent
        const existingToken = await tx.refreshToken.findUnique({
          where: { tokenHash: hashed },
        });

        if (existingToken && existingToken.revokedAt !== null) {
          // Token reuse attack or race collision detected: revoke all remaining tokens for this user
          await tx.refreshToken.updateMany({
            where: { userId: existingToken.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          throw new UnauthorizedError('Refresh token was already used and has been revoked');
        }

        throw new UnauthorizedError('Invalid or expired refresh token');
      }

      // Exactly one request succeeded in atomically revoking the token
      const tokenRecord = await tx.refreshToken.findUniqueOrThrow({
        where: { tokenHash: hashed },
        include: { user: true },
      });

      if (!tokenRecord.user.isActive) {
        throw new UnauthorizedError('User account is deactivated');
      }

      const newAccessToken = signAccessToken({
        userId: tokenRecord.user.id,
        email: tokenRecord.user.email,
        role: tokenRecord.user.role,
      });

      const { rawToken: newRawRefreshToken, tokenHash: newTokenHash, expiresAt: newExpiresAt } =
        generateRefreshToken();

      await tx.refreshToken.create({
        data: {
          userId: tokenRecord.user.id,
          tokenHash: newTokenHash,
          expiresAt: newExpiresAt,
        },
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRawRefreshToken,
      };
    });
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const hashed = hashToken(rawRefreshToken);

    await prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashed,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async register(input: RegisterInput): Promise<UserResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return user;
  }

  async getCurrentUser(userId: string): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }
}

export const authService = new AuthService();
