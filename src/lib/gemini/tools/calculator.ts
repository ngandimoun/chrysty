const MAX_EXPRESSION_LENGTH = 128;

const ALLOWED_PATTERN = /^[\d\s+\-*/^().%a-z]+$/i;

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '^' | '%' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'func'; value: 'sqrt' | 'abs' | 'round' };

function tokenize(expression: string): Token[] {
  const normalized = expression.replace(/\s+/g, '');
  if (normalized.length === 0 || normalized.length > MAX_EXPRESSION_LENGTH) {
    throw new Error('Expression is empty or too long.');
  }

  if (!ALLOWED_PATTERN.test(normalized)) {
    throw new Error('Expression contains unsupported characters.');
  }

  const tokens: Token[] = [];
  let index = 0;

  while (index < normalized.length) {
    const char = normalized[index]!;

    if (/[\d.]/.test(char)) {
      let end = index + 1;
      while (end < normalized.length && /[\d.]/.test(normalized[end]!)) {
        end += 1;
      }
      const raw = normalized.slice(index, end);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: ${raw}`);
      }
      tokens.push({ kind: 'number', value });
      index = end;
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'lparen' });
      index += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ kind: 'rparen' });
      index += 1;
      continue;
    }

    if ('+-*/^%'.includes(char)) {
      tokens.push({ kind: 'op', value: char as Token extends { kind: 'op'; value: infer V } ? V : never });
      index += 1;
      continue;
    }

    if (/[a-z]/i.test(char)) {
      let end = index + 1;
      while (end < normalized.length && /[a-z]/i.test(normalized[end]!)) {
        end += 1;
      }
      const name = normalized.slice(index, end).toLowerCase();
      if (name === 'sqrt' || name === 'abs' || name === 'round') {
        tokens.push({ kind: 'func', value: name });
        index = end;
        continue;
      }
      throw new Error(`Unsupported function: ${name}`);
    }

    throw new Error(`Unexpected character at position ${index}.`);
  }

  return tokens;
}

function toRpn(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const stack: Token[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };
  let previous: Token | null = null;

  for (const token of tokens) {
    if (token.kind === 'number') {
      output.push(token);
      previous = token;
      continue;
    }

    if (token.kind === 'func') {
      stack.push(token);
      previous = token;
      continue;
    }

    if (token.kind === 'op') {
      const isUnary =
        previous === null ||
        previous.kind === 'op' ||
        previous.kind === 'lparen' ||
        previous.kind === 'func';

      if (isUnary && token.value === '-') {
        output.push({ kind: 'number', value: 0 });
      } else if (isUnary && token.value !== '-') {
        throw new Error(`Unexpected operator: ${token.value}`);
      }

      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        if (top.kind !== 'op') {
          break;
        }
        if (precedence[top.value]! >= precedence[token.value]!) {
          output.push(stack.pop()!);
          continue;
        }
        break;
      }

      stack.push(token);
      previous = token;
      continue;
    }

    if (token.kind === 'lparen') {
      stack.push(token);
      previous = token;
      continue;
    }

    if (token.kind === 'rparen') {
      while (stack.length > 0 && stack[stack.length - 1]!.kind !== 'lparen') {
        output.push(stack.pop()!);
      }
      if (stack.length === 0) {
        throw new Error('Mismatched parentheses.');
      }
      stack.pop();
      if (stack.length > 0 && stack[stack.length - 1]!.kind === 'func') {
        output.push(stack.pop()!);
      }
      previous = token;
    }
  }

  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.kind === 'lparen' || top.kind === 'rparen') {
      throw new Error('Mismatched parentheses.');
    }
    output.push(top);
  }

  return output;
}

function evaluateRpn(tokens: Token[]): number {
  const stack: number[] = [];

  for (const token of tokens) {
    if (token.kind === 'number') {
      stack.push(token.value);
      continue;
    }

    if (token.kind === 'func') {
      const value = stack.pop();
      if (value === undefined) {
        throw new Error(`Function ${token.value} is missing an argument.`);
      }
      if (token.value === 'sqrt') {
        if (value < 0) {
          throw new Error('Square root of a negative number is not supported.');
        }
        stack.push(Math.sqrt(value));
      } else if (token.value === 'abs') {
        stack.push(Math.abs(value));
      } else {
        stack.push(Math.round(value));
      }
      continue;
    }

    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined) {
      throw new Error('Invalid expression.');
    }

    if (token.kind !== 'op') {
      throw new Error('Invalid expression.');
    }

    switch (token.value) {
      case '+':
        stack.push(left + right);
        break;
      case '-':
        stack.push(left - right);
        break;
      case '*':
        stack.push(left * right);
        break;
      case '/':
        if (right === 0) {
          throw new Error('Division by zero.');
        }
        stack.push(left / right);
        break;
      case '%':
        if (right === 0) {
          throw new Error('Modulo by zero.');
        }
        stack.push(left % right);
        break;
      case '^':
        stack.push(left ** right);
        break;
      default:
        throw new Error('Unsupported operator.');
    }
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0]!)) {
    throw new Error('Invalid expression.');
  }

  return stack[0]!;
}

export function evaluateExpression(expression: string): { result: number; expression: string } {
  const trimmed = expression.trim();
  const tokens = tokenize(trimmed);
  const rpn = toRpn(tokens);
  const result = evaluateRpn(rpn);

  return { expression: trimmed, result };
}
