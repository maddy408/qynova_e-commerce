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
        $workbook = new PhpSpreadsheetWorkbook();
        $sheet = $workbook->getActiveSheet();

        foreach ($headers as $colIndex => $header) {
            $sheet->setCellValue(Coordinate::stringFromColumnIndex($colIndex + 1) . '1', $header);
        }

        foreach ($rows as $rowIndex => $row) {
            foreach ($headers as $colIndex => $header) {
                $cell = Coordinate::stringFromColumnIndex($colIndex + 1) . (string) ($rowIndex + 2);
                $sheet->setCellValue($cell, $row[$header] ?? '');
            }
        }

        $dir = dirname($outputPath);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Could not create directory {$dir}");
        }

        (new Xlsx($workbook))->save($outputPath);
    }
}
