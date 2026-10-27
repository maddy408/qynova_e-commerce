<?php

declare(strict_types=1);

namespace App\Helpers;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet as PhpSpreadsheetWorkbook;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use RuntimeException;

final class Spreadsheet
{
    /**
     * Reads the first sheet into a list of associative rows keyed by the
     * header row (row 1). Blank trailing rows are skipped.
     *
     * @return list<array<string, string>>
     */
    public static function readRows(string $filePath): array
    {
        $spreadsheet = IOFactory::load($filePath);
        $sheet = $spreadsheet->getActiveSheet();
        $grid = $sheet->toArray(null, true, true, false);

        if ($grid === []) {
            return [];
        }

        $headers = array_map(fn ($h) => trim((string) $h), $grid[0]);
        $rows = [];

        for ($i = 1; $i < count($grid); $i++) {
            $raw = $grid[$i];
            $isBlank = true;

            foreach ($raw as $cell) {
                if (trim((string) $cell) !== '') {
                    $isBlank = false;
                    break;
                }
            }

            if ($isBlank) {
                continue;
            }

            $row = [];
            foreach ($headers as $colIndex => $header) {
                if ($header === '') {
                    continue;
                }
                $row[$header] = trim((string) ($raw[$colIndex] ?? ''));
            }

            $rows[] = $row;
        }

        return $rows;
    }

    /**
     * Writes rows (list of associative arrays) to a new .xlsx file at
     * $outputPath. $headers controls column order; a row missing a key
     * writes a blank cell.
     *
     * @param list<string> $headers
     * @param list<array<string, mixed>> $rows
     */
    public static function writeRows(string $outputPath, array $headers, array $rows): void
    {
        self::writeRowsWithInstructions($outputPath, $headers, $rows, null);
    }

    /**
     * Same as writeRows(), but when $instructions is non-null a second
     * "Instructions" sheet is appended — used for the import sample
     * template (spec: "a separate sheet for instructions and supported
     * values").
     *
     * @param list<string> $headers
     * @param list<array<string, mixed>> $rows
     * @param list<string>|null $instructions plain lines, one per row
     */
    public static function writeRowsWithInstructions(string $outputPath, array $headers, array $rows, ?array $instructions): void
    {
        $workbook = new PhpSpreadsheetWorkbook();
        $sheet = $workbook->getActiveSheet();
        $sheet->setTitle('Products');

        foreach ($headers as $colIndex => $header) {
            $sheet->setCellValue(Coordinate::stringFromColumnIndex($colIndex + 1) . '1', $header);
        }

        // Freeze the header row so it stays visible while scrolling through
        // product rows — applies to the Products sheet of every file this
        // method produces (the export, the sample template, and the
        // downloadable error report, which all share this one writer).
        $sheet->freezePane('A2');

        foreach ($rows as $rowIndex => $row) {
            foreach ($headers as $colIndex => $header) {
                $cell = Coordinate::stringFromColumnIndex($colIndex + 1) . (string) ($rowIndex + 2);
                $sheet->setCellValueExplicit($cell, self::sanitizeCell($row[$header] ?? ''), \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            }
        }

        if ($instructions !== null) {
            $instructionSheet = $workbook->createSheet();
            $instructionSheet->setTitle('Instructions');
            foreach ($instructions as $i => $line) {
                $instructionSheet->setCellValueExplicit('A' . ($i + 1), self::sanitizeCell($line), \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            }
            $instructionSheet->getColumnDimension('A')->setWidth(110);
            $workbook->setActiveSheetIndex(0);
        }

        $dir = dirname($outputPath);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Could not create directory {$dir}");
        }

        (new Xlsx($workbook))->save($outputPath);
    }

    /**
     * Spreadsheet-formula-injection guard (OWASP CSV injection): a cell
     * whose content starts with =, +, -, @, tab or CR is prefixed with a
     * leading apostrophe so Excel/LibreOffice render it as literal text
     * instead of evaluating it as a formula when the file is opened.
     */
    private static function sanitizeCell(mixed $value): string
    {
        $value = (string) $value;

        if ($value !== '' && str_contains("=+-@\t\r", $value[0])) {
            return "'" . $value;
        }

        return $value;
    }
}
