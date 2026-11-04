import "dotenv/config"
import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3"
import { isKeyPrivate } from "../lib/r2/config"

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const accountId = required("CLOUDFLARE_ACCOUNT_ID")
const accessKeyId = required("CLOUDFLARE_R2_ACCESS_KEY_ID")
const secretAccessKey = required("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
const sourceBucket = required("CLOUDFLARE_R2_BUCKET")
const destinationBucket = required("CLOUDFLARE_R2_PRIVATE_BUCKET")
if (sourceBucket === destinationBucket) throw new Error("Source and private buckets must differ")

const client = new S3Client({
  region: "auto",
  credentials: { accessKeyId, secretAccessKey },
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
})

let scanned = 0
let privateObjects = 0
let copied = 0
let alreadyPresent = 0
let failures = 0

async function run() {
  try {
    let continuationToken: string | undefined
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: sourceBucket,
        ContinuationToken: continuationToken,
      }))

      for (const object of page.Contents ?? []) {
        if (!object.Key) continue
        scanned += 1
        if (!isKeyPrivate(object.Key)) continue
        privateObjects += 1

        try {
          const source = await client.send(new HeadObjectCommand({ Bucket: sourceBucket, Key: object.Key }))
          let destination: { ETag?: string; ContentLength?: number; ContentType?: string } | null = null
          try {
            destination = await client.send(new HeadObjectCommand({ Bucket: destinationBucket, Key: object.Key }))
          } catch (error) {
            const name = (error as { name?: string }).name
            const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
            if (status !== 404 && name !== "NotFound" && name !== "NoSuchKey") throw error
          }

          const sourceEtag = source.ETag?.replaceAll('"', "")
          const destinationEtag = destination?.ETag?.replaceAll('"', "")
          if (
            destination &&
            Number(destination.ContentLength) === Number(source.ContentLength) &&
            destination.ContentType === source.ContentType &&
            sourceEtag && sourceEtag === destinationEtag
          ) {
            alreadyPresent += 1
            continue
          }
          if (destination) throw new Error("Destination key exists with different object metadata")

          await client.send(new CopyObjectCommand({
            Bucket: destinationBucket,
            Key: object.Key,
            CopySource: `${sourceBucket}/${encodeURIComponent(object.Key).replaceAll("%2F", "/")}`,
            MetadataDirective: "COPY",
          }))
          const verified = await client.send(new HeadObjectCommand({ Bucket: destinationBucket, Key: object.Key }))
          if (
            Number(verified.ContentLength) !== Number(source.ContentLength) ||
            verified.ContentType !== source.ContentType
          ) {
            throw new Error("Destination metadata verification failed")
          }
          copied += 1
        } catch {
          failures += 1
        }
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (continuationToken)

    console.log(JSON.stringify({ scanned, privateObjects, copied, alreadyPresent, failures }))
    if (failures > 0) process.exitCode = 1
  } finally {
    client.destroy()
  }
}

run().catch((err) => {
  console.error("Migration error:", err.message)
  process.exit(1)
})
