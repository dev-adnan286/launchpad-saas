import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';

const PASSWORD_RULES = {
  minLength: 8,
  pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
  message: 'Password must be at least 8 characters and contain letters and numbers',
};

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  email!: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(PASSWORD_RULES.minLength)
  @Matches(PASSWORD_RULES.pattern, { message: PASSWORD_RULES.message })
  password!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  @Length(1, 80)
  @Transform(({ value }: { value: string }) => value.trim())
  name!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  email!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(PASSWORD_RULES.minLength)
  @Matches(PASSWORD_RULES.pattern, { message: PASSWORD_RULES.message })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(PASSWORD_RULES.minLength)
  @Matches(PASSWORD_RULES.pattern, { message: PASSWORD_RULES.message })
  newPassword!: string;
}
