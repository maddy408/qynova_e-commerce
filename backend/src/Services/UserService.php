<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use PDOException;
use RuntimeException;

/**
 * Staff user management (docs/DOCUMENTATION.md section 3): admin
 * creates cashiers and other admins, assigns a role, can deactivate —
 * never hard-deletes (status flip, same as every other master here).
 */
final class UserService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        return $this->pdo->query(
            "SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at, r.id AS role_id, r.code AS role_code, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.deleted_at IS NULL
             ORDER BY u.created_at DESC"
        )->fetchAll();
    }

    /** @return list<array<string, mixed>> */
    public function listRoles(): array
    {
        return $this->pdo->query('SELECT id, code, name FROM roles ORDER BY name')->fetchAll();
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $name = trim((string) ($data['name'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $password = (string) ($data['password'] ?? '');
        $roleId = (int) ($data['role_id'] ?? 0);

        if ($name === '' || $email === '' || $password === '' || $roleId === 0) {
            throw new RuntimeException('name, email, password and role_id are required');
        }

        if (strlen($password) < 8) {
            throw new RuntimeException('Password must be at least 8 characters');
        }

        $roleCheck = $this->pdo->prepare('SELECT 1 FROM roles WHERE id = :id');
        $roleCheck->execute(['id' => $roleId]);
        if ($roleCheck->fetchColumn() === false) {
            throw new RuntimeException('Invalid role');
        }

        try {
            $this->pdo->prepare(
                'INSERT INTO users (role_id, name, email, phone, password_hash, status)
                 VALUES (:role_id, :name, :email, :phone, :password_hash, :status)'
            )->execute([
                'role_id' => $roleId,
                'name' => $name,
                'email' => $email,
                'phone' => $data['phone'] ?? null,
                'password_hash' => password_hash($password, PASSWORD_BCRYPT),
                'status' => ($data['status'] ?? 'ACTIVE') === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            ]);

            return (int) $this->pdo->lastInsertId();
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                throw new RuntimeException('A user with this email already exists');
            }
            throw $e;
        }
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): void
    {
        $fields = ['name', 'email', 'phone', 'role_id', 'status'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if (array_key_exists('password', $data) && trim((string) $data['password']) !== '') {
            if (strlen((string) $data['password']) < 8) {
                throw new RuntimeException('Password must be at least 8 characters');
            }
            $sets[] = 'password_hash = :password_hash';
            $params['password_hash'] = password_hash((string) $data['password'], PASSWORD_BCRYPT);
        }

        if ($sets === []) {
            return;
        }

        try {
            $stmt = $this->pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id AND deleted_at IS NULL');
            $stmt->execute($params);

            if ($stmt->rowCount() === 0) {
                throw new RuntimeException('User not found');
            }
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                throw new RuntimeException('A user with this email already exists');
            }
            throw $e;
        }
    }
}
