"use client";
import { usePlausible } from "next-plausible";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

import { UploadBox } from "@/components/shared/upload-box";
import { SVGScaleSelector } from "@/components/svg-scale-selector";

export type Scale = "custom" | number;

function scaleSvg(svgContent: string, scale: number) {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgElement = svgDoc.documentElement;
  const width = parseInt(svgElement.getAttribute("width") ?? "300");
  const height = parseInt(svgElement.getAttribute("height") ?? "150");

  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  svgElement.setAttribute("width", scaledWidth.toString());
  svgElement.setAttribute("height", scaledHeight.toString());

  return new XMLSerializer().serializeToString(svgDoc);
}

function useSvgConverter(props: {
  canvas: HTMLCanvasElement | null;
  svgContent: string;
  scale: number;
  fileName?: string;
  imageMetadata: { width: number; height: number; name: string };
}) {
  const { width, height, scaledSvg } = useMemo(() => {
    const scaledSvg = scaleSvg(props.svgContent, props.scale);

    return {
      width: props.imageMetadata.width * props.scale,
      height: props.imageMetadata.height * props.scale,
      scaledSvg,
    };
  }, [props.svgContent, props.scale, props.imageMetadata]);

  const convertToPng = async () => {
    const ctx = props.canvas?.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    // Trigger a "save image" of the resulting canvas content
    const saveImage = () => { 
      if (props.canvas) {
         const dataURL = props.canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataURL;
        const svgFileName = props.imageMetadata.name ?? "svg_converted";

        // Remove the .svg extension
        link.download = `${svgFileName.replace(".svg", "")}-${props.scale}x.png`;
        link.click();
      }
    };

    const img = new Image();
    // Call saveImage after the image has been drawn
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      saveImage();
    };

    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(scaledSvg)}`;
  };

  return {
    convertToPng,
    canvasProps: { width: width, height: height },
  };
}

interface SVGRendererProps {
  svgContent: string;
}

function SVGRenderer({ svgContent }: SVGRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = svgContent;
      const svgElement = containerRef.current.querySelector("svg");
      if (svgElement) {
        svgElement.setAttribute("width", "100%");
        svgElement.setAttribute("height", "100%");
      }
    }
  }, [svgContent]);

  return <div ref={containerRef} />;
}

// Add new type for batch items
interface BatchItem {
  id: string;
  scale: number;
  fileName: string;
  svgContent: string;
  imageMetadata: { width: number; height: number; name: string };
}

// Modify the batch conversion utility to not use hooks
async function convertSvgToPng(item: BatchItem) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Failed to get canvas context");

  // Scale the SVG
  const scaledSvg = scaleSvg(item.svgContent, item.scale);
  
  // Set canvas dimensions
  canvas.width = item.imageMetadata.width * item.scale;
  canvas.height = item.imageMetadata.height * item.scale;

  // Create and load image
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataURL;
      link.download = item.fileName;
      link.click();
      resolve(); 
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(scaledSvg)}`;
  });
}

// Update BatchPreview to use the new conversion function
function BatchPreview({ items, onRemove }: { items: BatchItem[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return null;

  const handleDownloadAll = async () => {
    for (const item of items) {
      await convertSvgToPng(item);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="rounded-lg bg-gray-800 p-4 shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Batch Queue ({items.length})</h3>
          <button
            onClick={() => void handleDownloadAll()}
            className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            Download All
          </button>
        </div>
        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 rounded bg-gray-700 p-2">
              <span className="text-sm text-white">{item.fileName} ({item.scale}x)</span>
              <button
                onClick={() => onRemove(item.id)}
                className="text-red-400 hover:text-red-300"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Modify SaveAsPngButton to include batch functionality
function SaveAsPngButton({
  svgContent,
  scale,
  imageMetadata,
  onAddToBatch,
}: {
  svgContent: string;
  scale: number;
  imageMetadata: { width: number; height: number; name: string };
  onAddToBatch: (item: BatchItem) => void;
}) {
  const [canvasRef, setCanvasRef] = useState<HTMLCanvasElement | null>(null);
  const { convertToPng, canvasProps } = useSvgConverter({
    canvas: canvasRef,
    svgContent,
    scale,
    imageMetadata,
  });

  const plausible = usePlausible();

  return (
    <div className="flex gap-2">
      <canvas ref={setCanvasRef} {...canvasProps} hidden />
      <button
        onClick={() => {
          plausible("convert-svg-to-png");
          void convertToPng();
        }}
        className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors duration-200 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75"
      >
        Save as PNG
      </button>
      <button
        onClick={() => {
          plausible("add-to-batch");
          onAddToBatch({
            id: crypto.randomUUID(),
            scale,
            fileName: `${imageMetadata.name.replace(".svg", "")}-${scale}x.png`,
            svgContent,
            imageMetadata,
          });
        }}
        className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors duration-200 hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
      >
        Add to Batch
      </button>
    </div>
  );
}

import {
  type FileUploaderResult,
  useFileUploader,
} from "@/hooks/use-file-uploader";
import { FileDropzone } from "@/components/shared/file-dropzone";

function SVGToolCore(props: { fileUploaderProps: FileUploaderResult }) {
  const { rawContent, imageMetadata, handleFileUploadEvent, cancel } =
    props.fileUploaderProps;

  const [scale, setScale] = useLocalStorage<Scale>("svgTool_scale", 1);
  const [customScale, setCustomScale] = useLocalStorage<number>(
    "svgTool_customScale",
    1,
  );

  // Get the actual numeric scale value
  const effectiveScale = scale === "custom" ? customScale : scale;

  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  const addToBatch = (item: BatchItem) => {
    setBatchItems((prev) => [...prev, item]);
  };

  const removeFromBatch = (id: string) => {
    setBatchItems((prev) => prev.filter((item) => item.id !== id));
  };

  if (!imageMetadata)
    return (
      <UploadBox
        title="Make SVGs into PNGs. Also makes them bigger. (100% free btw.)"
        description="Upload SVG"
        accept=".svg"
        onChange={handleFileUploadEvent}
      />
    );

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-6 p-6">
      {/* Preview Section */}
      <div className="flex w-full flex-col items-center gap-4 rounded-xl p-6">
        <SVGRenderer svgContent={rawContent} />
        <p className="text-lg font-medium text-white/80">
          {imageMetadata.name}
        </p>
      </div>

      {/* Size Information */}
      <div className="flex gap-6 text-base">
        <div className="flex flex-col items-center rounded-lg bg-white/5 p-3">
          <span className="text-sm text-white/60">Original</span>
          <span className="font-medium text-white">
            {imageMetadata.width} × {imageMetadata.height}
          </span>
        </div>

        <div className="flex flex-col items-center rounded-lg bg-white/5 p-3">
          <span className="text-sm text-white/60">Scaled</span>
          <span className="font-medium text-white">
            {imageMetadata.width * effectiveScale} ×{" "}
            {imageMetadata.height * effectiveScale}
          </span>
        </div>
      </div>

      {/* Scale Controls */}
      <SVGScaleSelector
        title="Scale Factor"
        options={[1, 2, 4, 8, 16, 32, 64]}
        selected={scale}
        onChange={setScale}
        customValue={customScale}
        onCustomValueChange={setCustomScale}
      />

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={cancel}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-red-800"
        >
          Cancel
        </button>
        <SaveAsPngButton
          svgContent={rawContent}
          scale={effectiveScale}
          imageMetadata={imageMetadata}
          onAddToBatch={addToBatch}
        />
      </div>

      {/* Batch Preview */}
      <BatchPreview items={batchItems} onRemove={removeFromBatch} />
    </div>
  );
}

export function SVGTool() {
  const fileUploaderProps = useFileUploader();
  return (
    <FileDropzone
      setCurrentFile={fileUploaderProps.handleFileUpload}
      acceptedFileTypes={["image/svg+xml", ".svg"]}
      dropText="Drop SVG file"
    >
      <SVGToolCore fileUploaderProps={fileUploaderProps} />
    </FileDropzone>
  );
}
