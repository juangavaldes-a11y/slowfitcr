import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { apiRequest } from "../../../../lib/api-client";
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Type definitions for catalog data
type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  published: boolean;
  preorderEnabled: boolean;
  tags: string[];
  minPrice: number;
  images: Array<{ url: string; altText: string }>;
  variants: Array<{
    title: string;
    size?: string | null;
    color?: string | null;
    price: number;
    compareAtPrice?: number | null;
    inventoryQuantity: number;
  }>;
};

type GenerateCatalogResponse = {
  success: boolean;
  message: string;
  downloadUrl?: string;
};

export async function POST(request: NextRequest) {
  try {
    // In a real implementation, you would authenticate the request
    // For now, we'll just check for admin access
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // For demonstration purposes, we'll create sample product data
    // In a real implementation, you would fetch actual product data
    // from your database or API
    const products: CatalogProduct[] = [
      {
        id: "1",
        title: "Premium T-Shirt",
        handle: "premium-t-shirt",
        description: "High-quality cotton t-shirt with comfortable fit",
        status: "ACTIVE",
        published: true,
        preorderEnabled: false,
        tags: ["clothing", "summer"],
        minPrice: 29.99,
        images: [{ url: "/slowfit/hero.jpg", altText: "Premium T-Shirt" }],
        variants: [
          {
            title: "Small",
            size: "S",
            color: "White",
            price: 29.99,
            inventoryQuantity: 100
          }
        ]
      },
      {
        id: "2",
        title: "Designer Jeans",
        handle: "designer-jeans",
        description: "Stylish jeans with perfect fit",
        status: "ACTIVE",
        published: true,
        preorderEnabled: false,
        tags: ["clothing", "pants"],
        minPrice: 89.99,
        images: [{ url: "/slowfit/hero.jpg", altText: "Designer Jeans" }],
        variants: [
          {
            title: "Medium",
            size: "M",
            color: "Blue",
            price: 89.99,
            inventoryQuantity: 50
          }
        ]
      }
    ];

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Add a title page
    const titlePage = pdfDoc.addPage([600, 800]);
    titlePage.drawText('Slow Fit Catalog', {
      x: 50,
      y: 700,
      size: 30,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    const date = new Date().toLocaleDateString();
    titlePage.drawText(`Generated on: ${date}`, {
      x: 50,
      y: 650,
      size: 15,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });

    titlePage.drawText(`Total Products: ${products.length}`, {
      x: 50,
      y: 620,
      size: 15,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Add product pages
    let currentPage = titlePage;
    let currentY = 550;

    for (const product of products) {
      // Check if we need a new page
      if (currentY < 100) {
        currentPage = pdfDoc.addPage([600, 800]);
        currentY = 750;
      }

      // Product title
      currentPage.drawText(product.title, {
        x: 50,
        y: currentY,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      currentY -= 25;

      // Product description
      const description = product.description.length > 100
        ? product.description.substring(0, 100) + "..."
        : product.description;

      currentPage.drawText(description, {
        x: 50,
        y: currentY,
        size: 12,
        font: font,
        color: rgb(0.3, 0.3, 0.3),
      });

      currentY -= 20;

      // Price information
      const priceText = `Price: $${product.minPrice.toFixed(2)}`;
      currentPage.drawText(priceText, {
        x: 50,
        y: currentY,
        size: 14,
        font: font,
        color: rgb(0, 0, 0),
      });

      currentY -= 20;

      // Tags
      if (product.tags.length > 0) {
        const tagsText = `Tags: ${product.tags.join(", ")}`;
        currentPage.drawText(tagsText, {
          x: 50,
          y: currentY,
          size: 10,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
        });
        currentY -= 20;
      }

      // Status
      const statusText = `Status: ${product.status} ${product.published ? "(Published)" : "(Draft)"}`;
      currentPage.drawText(statusText, {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      currentY -= 40; // Extra space between products
    }

    // Save the PDF to the public directory
    const pdfBytes = await pdfDoc.save();
    const publicDir = path.join(process.cwd(), 'public', 'slowfit');

    // Ensure the directory exists
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `catalog-${timestamp}.pdf`;
    const filePath = path.join(publicDir, filename);

    // Write the PDF file
    fs.writeFileSync(filePath, pdfBytes);

    // Also create/update the main catalog.pdf file
    const mainCatalogPath = path.join(publicDir, 'catalog.pdf');
    fs.writeFileSync(mainCatalogPath, pdfBytes);

    return NextResponse.json({
      success: true,
      message: "Catalog generated successfully",
      downloadUrl: `/slowfit/${filename}`
    } satisfies GenerateCatalogResponse);
  } catch (error) {
    console.error("Error generating catalog:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to generate catalog: " + (error instanceof Error ? error.message : "Unknown error")
      } satisfies GenerateCatalogResponse,
      { status: 500 }
    );
  }
}