import { ValidationPipe } from '@nestjs/common';

export function createValidationPipe() {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    disableErrorMessages: true,
  });
}
