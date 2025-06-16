from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import List, Optional, Dict
import httpx
from database import get_db_connection
import os
from pathlib import Path
import uuid
import logging

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="http://localhost:4000/auth/token")
router = APIRouter(prefix="/is_products", tags=["Inventory Management System - Products"])

# ims config for images
ROUTER_BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIRECTORY_PHYSICAL = ROUTER_BASE_DIR / "static_files" / "product_images"
UPLOAD_DIRECTORY_PHYSICAL.mkdir(parents=True, exist_ok=True)

IMAGE_DB_PATH_PREFIX = "/product_images" 
IMAGE_URL_STATIC_PREFIX = "/static_files" 

# ims base url
IS_EXTERNAL_BASE_URL = os.getenv("IS_EXTERNAL_URL", "http://localhost:8001")
logger.info(f"IS: External base URL for image links: {IS_EXTERNAL_BASE_URL}")

# pos base url
POS_BASE_URL = "http://localhost:9001"
POS_API_COMMON_PRODUCT_PATH = "/Products/products"

# models
class ProductOut(BaseModel):
    ProductID: int
    ProductName: str
    ProductTypeID: int
    ProductCategory: str
    ProductDescription: Optional[str] = None
    ProductPrice: float
    ProductImage: Optional[str] = None 
    ProductSizes: Optional[List[str]] = None
    ProductTypeSizeRequired: bool

class ProductDataForPOS(BaseModel):
    ProductName: str
    ProductTypeName: str
    ProductCategory: str
    ProductDescription: Optional[str] = None
    ProductPrice: float
    ProductImage: Optional[str] = None 
    ProductSize: Optional[str] = None

class ProductSizeCreate(BaseModel):
    SizeName: str

class ProductSizeOut(BaseModel):
    SizeID: int
    ProductID: int
    SizeName: str

# auth validation
async def validate_token_and_roles(token: str, allowed_roles: List[str], allowed_systems: List[str] = ["IMS"]):
    USER_SERVICE_ME_URL = "http://localhost:4000/auth/users/me" 
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(USER_SERVICE_ME_URL, headers={"Authorization": f"Bearer {token}"})
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            error_detail = f"IMS Auth service error: {e.response.status_code}"
            try: error_detail += f" - {e.response.json().get('detail', e.response.text)}"
            except: error_detail += f" - {e.response.text}"
            logger.error(error_detail)
            raise HTTPException(status_code=e.response.status_code, detail=error_detail)
        except httpx.RequestError as e:
            logger.error(f"IMS Auth service unavailable: {e}")
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"IMS Auth service unavailable: {e}")
    user_data = response.json()
    user_role = user_data.get("userRole")
    user_system = user_data.get("system")
    if user_role not in allowed_roles or user_system not in allowed_systems:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

# image url helper
def _construct_relative_url_for_is_response(db_image_path: Optional[str]) -> Optional[str]:
    """Constructs a relative URL path for IS's own clients (e.g., /static_files/product_images/img.jpg)"""
    if db_image_path and db_image_path.startswith(IMAGE_DB_PATH_PREFIX):
        return f"{IMAGE_URL_STATIC_PREFIX}{db_image_path}"
    return db_image_path # or none

def _construct_full_http_url_for_pos_sync(is_db_image_path: Optional[str]) -> Optional[str]:
    """
    Constructs a full, downloadable HTTP URL for the image to be sent to POS.
    Example: is_db_image_path = "/product_images/img.jpg"
             IMAGE_URL_STATIC_PREFIX = "/static_files"
             IS_EXTERNAL_BASE_URL = "http://localhost:8001"
             Result: "http://localhost:8001/static_files/product_images/img.jpg"
    """
    if not is_db_image_path or not is_db_image_path.startswith(IMAGE_DB_PATH_PREFIX):
        return None 

    relative_url_for_is_serving = f"{IMAGE_URL_STATIC_PREFIX}{is_db_image_path}"
    full_url = f"{IS_EXTERNAL_BASE_URL}{relative_url_for_is_serving}"
    logger.debug(f"IMS: Constructed full image URL for POS sync: {full_url} from DB path {is_db_image_path}")
    return full_url


async def _get_product_type_details(conn, product_type_id: int) -> Optional[Dict[str, any]]:
    async with conn.cursor() as cursor_type:
        await cursor_type.execute(
            "SELECT ProductTypeName, SizeRequired FROM ProductType WHERE ProductTypeID = ?", product_type_id
        )
        type_row = await cursor_type.fetchone()
        if type_row:
            return {"name": type_row.ProductTypeName, "size_required": bool(type_row.SizeRequired)}
        return None

# pos sync helper 
async def _sync_product_to_pos(token: str, product_data: ProductDataForPOS, product_id_for_put: Optional[int] = None):
    pos_headers = {"Authorization": f"Bearer {token}"}
    full_pos_url = f"{POS_BASE_URL}{POS_API_COMMON_PRODUCT_PATH}/" 

    if product_id_for_put:
        pos_method = "PUT"
        full_pos_url = f"{POS_BASE_URL}{POS_API_COMMON_PRODUCT_PATH}/{product_id_for_put}"
    else:
        pos_method = "POST"

    try:
        # ensure product image is not if its an empty string
        payload_dict = product_data.model_dump(exclude_none=True) # cleaner logs
        if "ProductImage" in payload_dict and not payload_dict["ProductImage"]:
            payload_dict["ProductImage"] = None

        async with httpx.AsyncClient(timeout=15.0) as client: 
            logger.info(f"IMS: Syncing product to POS ({pos_method} {full_pos_url}). Payload: {payload_dict}")
            pos_response = await client.request(
                method=pos_method, url=full_pos_url, json=payload_dict, headers=pos_headers
            )
            pos_response.raise_for_status()
            logger.info(f"IMS: POS Sync Successful ({pos_method} {full_pos_url}): {pos_response.status_code} - {pos_response.text}")
    except httpx.HTTPStatusError as e:
        logger.error(f"IMS: POS Sync HTTPStatusError ({pos_method} {full_pos_url}): {e.response.status_code} - {e.response.text}")
    except httpx.RequestError as e:
        logger.error(f"IMS: POS Sync RequestError ({pos_method} {full_pos_url}): POS Unreachable - {str(e)}")

async def _sync_add_specific_size_by_name_to_pos(token: str, product_name: str, size_name: str):
    pos_headers = {"Authorization": f"Bearer {token}"}
    pos_add_size_url = f"{POS_BASE_URL}{POS_API_COMMON_PRODUCT_PATH}/add-size-by-name"
    
    payload = {"ProductName": product_name, "SizeName": size_name}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            logger.info(f"IMS: Syncing new size to POS by ProductName (POST {pos_add_size_url}): {payload}")
            response = await client.post(pos_add_size_url, json=payload, headers=pos_headers)
            response.raise_for_status()
            logger.info(f"IMS: POS successfully added size by ProductName. Response: {response.json()}")
    except httpx.HTTPStatusError as e:
        error_detail = f"IMS: Failed to sync added size by ProductName to POS. Status: {e.response.status_code}, Detail: {e.response.text}"
        logger.error(error_detail)
    except httpx.RequestError as e:
        error_detail = f"IMS: Could not connect to POS to sync added size by ProductName. Error: {str(e)}"
        logger.error(error_detail)

async def _sync_delete_product_from_pos(token: str, product_id_in_pos: int):
    pos_headers = {"Authorization": f"Bearer {token}"}
    pos_delete_url = f"{POS_BASE_URL}{POS_API_COMMON_PRODUCT_PATH}/{product_id_in_pos}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            logger.info(f"IMS: Syncing delete to POS (DELETE {pos_delete_url})")
            pos_response = await client.delete(url=pos_delete_url, headers=pos_headers)
            if pos_response.status_code not in [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT, status.HTTP_404_NOT_FOUND]:
                pos_response.raise_for_status() 
            logger.info(f"IMS: POS Delete Sync for product {product_id_in_pos} (Status: {pos_response.status_code})")
    except httpx.HTTPStatusError as e:
        logger.error(f"IMS: POS Delete Sync HTTPStatusError for product {product_id_in_pos}: {e.response.status_code} - {e.response.text}")
    except httpx.RequestError as e:
        logger.error(f"IMS: POS Delete Sync RequestError for product {product_id_in_pos}: POS Unreachable - {str(e)}")


# get products
@router.get("/products/", response_model=List[ProductOut])
async def get_all_products(token: str = Depends(oauth2_scheme)):
    # auth validation
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = None
    try:
        conn = await get_db_connection()
        async with conn.cursor() as cursor:
            await cursor.execute("""
                SELECT p.ProductID, p.ProductName, p.ProductTypeID, pt.SizeRequired,
                       p.ProductCategory, p.ProductDescription, p.ProductPrice, p.ProductImage
                FROM Products p
                JOIN ProductType pt ON p.ProductTypeID = pt.ProductTypeID
                ORDER BY p.ProductName
            """)
            product_rows = await cursor.fetchall()
            if not product_rows: return []
            product_ids = [r.ProductID for r in product_rows]
            sizes_by_product_id = {}
            if product_ids:
                placeholders = ','.join(['?'] * len(product_ids))
                size_query = f"SELECT ProductID, SizeName FROM Size WHERE ProductID IN ({placeholders}) ORDER BY ProductID, SizeName"
                await cursor.execute(size_query, *product_ids)
                size_rows_db = await cursor.fetchall()
                for sr in size_rows_db:
                    sizes_by_product_id.setdefault(sr.ProductID, []).append(sr.SizeName)
            
            return [
                ProductOut(
                    ProductID=r.ProductID, ProductName=r.ProductName, ProductTypeID=r.ProductTypeID,
                    ProductCategory=r.ProductCategory, ProductDescription=r.ProductDescription,
                    ProductPrice=float(r.ProductPrice or 0.0),
                    ProductImage=_construct_relative_url_for_is_response(r.ProductImage), 
                    ProductSizes=sizes_by_product_id.get(r.ProductID),
                    ProductTypeSizeRequired=bool(r.SizeRequired)
                ) for r in product_rows
            ]
    finally:
        if conn: await conn.close()

# create
@router.post("/products/", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_new_product(
    token: str = Depends(oauth2_scheme), ProductName: str = Form(...), ProductTypeID: int = Form(...),
    ProductCategory: str = Form(...), ProductDescription: Optional[str] = Form(None), ProductPrice: float = Form(...),
    ProductSize: Optional[str] = Form(None), ProductImageFile: Optional[UploadFile] = File(None)
):
    # auth validation
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = None
    new_product_id: Optional[int] = None
    is_db_image_path: Optional[str] = None 
    product_type_name: str = "Unknown Type"
    product_type_size_required: bool = False
    initial_product_size_for_pos_and_response: Optional[str] = None

    try:
        conn = await get_db_connection()
        async with conn.cursor() as cursor:
            # duplicate check
            await cursor.execute(
                """
                SELECT ProductID FROM Products
                WHERE ProductName COLLATE Latin1_General_CI_AS = ?
                AND ProductCategory COLLATE Latin1_General_CI_AS = ?
                """,
                ProductName, ProductCategory
            )
            if await cursor.fetchone():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"IMS: Product with name '{ProductName}' and category '{ProductCategory}' already exists.")

            type_details = await _get_product_type_details(conn, ProductTypeID)
            if not type_details:
                 raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"IMS: ProductTypeID {ProductTypeID} not found.")
            product_type_name = type_details["name"]
            product_type_size_required = type_details["size_required"]

            # image file handling
            if ProductImageFile:
                if not ProductImageFile.content_type or not ProductImageFile.content_type.startswith("image/"):
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file not a valid image.")
                ext = Path(ProductImageFile.filename).suffix.lower()
                if ext not in [".png", ".jpg", ".jpeg", ".gif", ".webp"]:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported image extension: {ext}")
                unique_filename = f"{uuid.uuid4()}{ext}"
                physical_file_loc = UPLOAD_DIRECTORY_PHYSICAL / unique_filename
                try:
                    with open(physical_file_loc, "wb") as f: contents = await ProductImageFile.read(); f.write(contents)
                    is_db_image_path = f"{IMAGE_DB_PATH_PREFIX}/{unique_filename}" 
                    logger.info(f"IMS: Saved new product image to {physical_file_loc}, DB path: {is_db_image_path}")
                except Exception as e: 
                    logger.error(f"IMS: File save error: {e}"); 
                    raise HTTPException(status_code=500, detail="IS: Image save failed.")
                finally: await ProductImageFile.close()
            
            # save to db
            await cursor.execute("""
                INSERT INTO Products (ProductName, ProductTypeID, ProductCategory, ProductDescription, ProductPrice, ProductImage)
                OUTPUT INSERTED.ProductID VALUES (?, ?, ?, ?, ?, ?)
            """, ProductName, ProductTypeID, ProductCategory, ProductDescription, ProductPrice, is_db_image_path)
            id_row = await cursor.fetchone()
            if not id_row or not id_row.ProductID: raise HTTPException(status_code=500, detail="IMS: Product creation failed.")
            new_product_id = id_row.ProductID

            if ProductSize and ProductSize.strip():
                initial_product_size_for_pos_and_response = ProductSize.strip()
                await cursor.execute("INSERT INTO Size (ProductID, SizeName) VALUES (?, ?)", new_product_id, initial_product_size_for_pos_and_response)
            
            is_response_data = ProductOut(
                ProductID=new_product_id, ProductName=ProductName, ProductTypeID=ProductTypeID,
                ProductCategory=ProductCategory, ProductDescription=ProductDescription,
                ProductPrice=ProductPrice, 
                ProductImage=_construct_relative_url_for_is_response(is_db_image_path), 
                ProductSizes=[initial_product_size_for_pos_and_response] if initial_product_size_for_pos_and_response else None,
                ProductTypeSizeRequired=product_type_size_required
            )

        # sync to POS
        product_for_pos_sync = ProductDataForPOS(
            ProductName=ProductName, ProductTypeName=product_type_name,
            ProductCategory=ProductCategory, ProductDescription=ProductDescription, 
            ProductPrice=ProductPrice, 
            ProductImage=_construct_full_http_url_for_pos_sync(is_db_image_path),
            ProductSize=initial_product_size_for_pos_and_response
        )
        await _sync_product_to_pos(token, product_for_pos_sync)

        return is_response_data
    finally:
        if conn: await conn.close()

# update products
@router.put("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int, token: str = Depends(oauth2_scheme), ProductName: str = Form(...), ProductTypeID: int = Form(...),
    ProductCategory: str = Form(...), ProductDescription: Optional[str] = Form(None), ProductPrice: float = Form(...),
    ProductSize: Optional[str] = Form(None),
    ProductImageFile: Optional[UploadFile] = File(None)
):
    # auth validation
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = None
    is_db_image_path_for_update: Optional[str] = None 
    representative_size_for_pos: Optional[str] = None 
    product_sizes_for_response: Optional[List[str]] = None
    product_type_name: str = "Unknown Type"
    product_type_size_required: bool = False

    try:
        conn = await get_db_connection()
        
        # check if product type is the same
        type_details = await _get_product_type_details(conn, ProductTypeID)
        if not type_details:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"IMS: ProductTypeID {ProductTypeID} not found for update.")
        product_type_name = type_details["name"]
        product_type_size_required = type_details["size_required"]

        async with conn.cursor() as cursor:
            # get current image path
            await cursor.execute("SELECT ProductImage FROM Products WHERE ProductID = ?", product_id)
            current_is_product_row = await cursor.fetchone()
            if not current_is_product_row: raise HTTPException(status_code=404, detail="IMS: Product not found.")
            existing_is_db_image_path = current_is_product_row.ProductImage

            # handle new image upload
            if ProductImageFile:
                # image validation
                if not ProductImageFile.content_type or not ProductImageFile.content_type.startswith("image/"):
                    raise HTTPException(status_code=400, detail="Uploaded file not valid image.")
                ext = Path(ProductImageFile.filename).suffix.lower()
                if ext not in [".png", ".jpg", ".jpeg", ".gif", ".webp"]: raise HTTPException(status_code=400, detail=f"Unsupported image ext: {ext}")
                unique_filename = f"{uuid.uuid4()}{ext}"
                physical_file_loc = UPLOAD_DIRECTORY_PHYSICAL / unique_filename
                try:
                    with open(physical_file_loc, "wb") as f: contents = await ProductImageFile.read(); f.write(contents)
                    is_db_image_path_for_update = f"{IMAGE_DB_PATH_PREFIX}/{unique_filename}"
                    logger.info(f"IS: Saved updated product image to {physical_file_loc}, DB path: {is_db_image_path_for_update}")
                    # delete old image
                    if existing_is_db_image_path and existing_is_db_image_path != is_db_image_path_for_update:
                        old_file_name = Path(existing_is_db_image_path).name
                        old_file_physical_path = UPLOAD_DIRECTORY_PHYSICAL / old_file_name
                        if old_file_physical_path.exists():
                            try: os.remove(old_file_physical_path); logger.info(f"IMS: Deleted old image {old_file_physical_path}")
                            except OSError as e_os: logger.error(f"IMS: Error deleting old image {old_file_physical_path}: {e_os}")
                except Exception as e: 
                    logger.error(f"IMS: File save error for update: {e}"); 
                    raise HTTPException(status_code=500, detail="IMS: Image update save failed.")
                finally: await ProductImageFile.close()
            else:
                is_db_image_path_for_update = existing_is_db_image_path

            # duplicate check
            await cursor.execute(
                """
                SELECT 1 FROM Products
                WHERE ProductName COLLATE Latin1_General_CI_AS = ?
                AND ProductCategory COLLATE Latin1_General_CI_AS = ?
                AND ProductID != ?
                """,
                ProductName, ProductCategory, product_id
            )
            if await cursor.fetchone():
                raise HTTPException(status_code=400, detail="IMS: Product name and category already exist for another product.")

            await cursor.execute("""
                UPDATE Products SET ProductName = ?, ProductTypeID = ?, ProductCategory = ?,
                ProductDescription = ?, ProductPrice = ?, ProductImage = ? WHERE ProductID = ?
            """, ProductName, ProductTypeID, ProductCategory, ProductDescription, ProductPrice, is_db_image_path_for_update, product_id)

            # size handling
            await cursor.execute("DELETE FROM Size WHERE ProductID = ?", product_id)
            if ProductSize and ProductSize.strip():
                representative_size_for_pos = ProductSize.strip()
                await cursor.execute("INSERT INTO Size (ProductID, SizeName) VALUES (?, ?)", product_id, representative_size_for_pos)
                product_sizes_for_response = [representative_size_for_pos]
            else: 
                representative_size_for_pos = None
                product_sizes_for_response = None
            
            is_response_data = ProductOut(
                ProductID=product_id, ProductName=ProductName, ProductTypeID=ProductTypeID, ProductCategory=ProductCategory,
                ProductDescription=ProductDescription, ProductPrice=float(ProductPrice),
                ProductImage=_construct_relative_url_for_is_response(is_db_image_path_for_update), 
                ProductSizes=product_sizes_for_response,
                ProductTypeSizeRequired=product_type_size_required
            )

        # sync to POS
        product_for_pos_update = ProductDataForPOS(
            ProductName=ProductName, ProductTypeName=product_type_name, ProductCategory=ProductCategory,
            ProductDescription=ProductDescription, ProductPrice=float(ProductPrice),
            ProductImage=_construct_full_http_url_for_pos_sync(is_db_image_path_for_update), 
            ProductSize=representative_size_for_pos
        )
        await _sync_product_to_pos(token, product_for_pos_update, product_id_for_put=product_id)

        return is_response_data
    finally:
        if conn: await conn.close()

# delete products
@router.delete("/products/{product_id}", status_code=status.HTTP_200_OK) 
async def delete_product(product_id: int, token: str = Depends(oauth2_scheme)):
    # auth validation
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = None
    try:
        conn = await get_db_connection()
        async with conn.cursor() as cursor:
            await cursor.execute("SELECT ProductImage FROM Products WHERE ProductID = ?", product_id)
            product_row = await cursor.fetchone()
            if not product_row: raise HTTPException(status_code=404, detail="IMS: Product not found.")
            is_db_image_path_to_delete = product_row.ProductImage

            await cursor.execute("DELETE FROM Size WHERE ProductID = ?", product_id)
            delete_product_op = await cursor.execute("DELETE FROM Products WHERE ProductID = ?", product_id)
            if delete_product_op.rowcount == 0 : 
                logger.warning(f"IMS: Product ID {product_id} was not found or not deleted from Products table during delete operation.")
            
            # delete image from server
            if is_db_image_path_to_delete:
                image_filename = Path(is_db_image_path_to_delete).name
                physical_file_to_delete = UPLOAD_DIRECTORY_PHYSICAL / image_filename
                if physical_file_to_delete.exists():
                    try: os.remove(physical_file_to_delete); logger.info(f"IS: Deleted image file {physical_file_to_delete}")
                    except OSError as e: logger.error(f"IMS: Error deleting image file {physical_file_to_delete}: {e}")

        # sync to pos
        await _sync_delete_product_from_pos(token, product_id)

        return {"message": f"IMS: Product {product_id} and its sizes deleted successfully from IS and deletion synced to POS."}
    finally:
        if conn: await conn.close()

# create product sizes
@router.post("/products/{product_id}/sizes", response_model=ProductSizeOut, status_code=status.HTTP_201_CREATED)
async def add_size_to_existing_product(
    product_id: int, size_data: ProductSizeCreate, token: str = Depends(oauth2_scheme)
):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = None
    newly_added_size_name: Optional[str] = None
    product_name_for_pos: Optional[str] = None

    try:
        conn = await get_db_connection()
        async with conn.cursor() as cursor_fetch_product:
            await cursor_fetch_product.execute(
                "SELECT p.ProductName, pt.SizeRequired FROM Products p JOIN ProductType pt ON p.ProductTypeID = pt.ProductTypeID WHERE p.ProductID = ?", product_id
            )
            product_info_row = await cursor_fetch_product.fetchone()
            if not product_info_row:
                 raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"IMS: Product with ID {product_id} not found.")
            if not bool(product_info_row.SizeRequired):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"IMS: Product type for product ID {product_id} does not require sizes. Cannot add size.")
            product_name_for_pos = product_info_row.ProductName

        async with conn.cursor() as cursor_modify:
            trimmed_size_name = size_data.SizeName.strip()
            if not trimmed_size_name:
                 raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IMS: SizeName cannot be empty.")

            await cursor_modify.execute("SELECT SizeID FROM Size WHERE ProductID = ? AND SizeName COLLATE Latin1_General_CI_AS = ?", product_id, trimmed_size_name)
            if await cursor_modify.fetchone():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"IMS: Size '{trimmed_size_name}' already exists for product ID {product_id}.")
            
            await cursor_modify.execute("INSERT INTO Size (ProductID, SizeName) OUTPUT INSERTED.SizeID VALUES (?, ?)", product_id, trimmed_size_name)
            new_size_id_row = await cursor_modify.fetchone()
            if not new_size_id_row or not new_size_id_row.SizeID:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="IMS: Failed to add size.")
            
            newly_added_size_name = trimmed_size_name
            is_response_data = ProductSizeOut(SizeID=new_size_id_row.SizeID, ProductID=product_id, SizeName=newly_added_size_name)

        if newly_added_size_name and product_name_for_pos:
            await _sync_add_specific_size_by_name_to_pos(token, product_name_for_pos, newly_added_size_name)
        elif not product_name_for_pos:
            logger.error(f"IMS: ProductName not found for ProductID {product_id}, cannot sync size to POS by name.")


        return is_response_data
    finally:
        if conn: await conn.close()

# get product sizes
@router.get("/products/{product_id}/sizes", response_model=List[ProductSizeOut])
async def get_sizes_for_specific_product_is(product_id: int, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = None
    try:
        conn = await get_db_connection()
        async with conn.cursor() as cursor:
            await cursor.execute("SELECT ProductID FROM Products WHERE ProductID = ?", product_id)
            if not await cursor.fetchone(): raise HTTPException(status_code=404, detail=f"IS: Product ID {product_id} not found.")
            await cursor.execute("SELECT SizeID, ProductID, SizeName FROM Size WHERE ProductID = ? ORDER BY SizeName", product_id)
            return [ProductSizeOut(SizeID=r.SizeID, ProductID=r.ProductID, SizeName=r.SizeName) for r in await cursor.fetchall()]
    finally:
        if conn: await conn.close()

# delete product sizes
@router.delete("/products/{product_id}/sizes/{size_id}", status_code=status.HTTP_200_OK)
async def delete_specific_size_from_product_is(product_id: int, size_id: int, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])
    conn = None
    try:
        conn = await get_db_connection()
        original_product_info_for_pos_sync: Optional[Dict] = None 

        async with conn.cursor() as cursor_fetch_product:
            await cursor_fetch_product.execute(
                """SELECT p.ProductName, pt.ProductTypeName, p.ProductCategory, 
                          p.ProductDescription, p.ProductPrice, p.ProductImage 
                   FROM Products p 
                   JOIN ProductType pt ON p.ProductTypeID = pt.ProductTypeID 
                   WHERE p.ProductID = ?""", product_id
            )
            product_info_row = await cursor_fetch_product.fetchone()
            if not product_info_row:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"IMS: Product with ID {product_id} not found (for POS sync prep).")
            original_product_info_for_pos_sync = dict(zip([column[0] for column in cursor_fetch_product.description], product_info_row))


        async with conn.cursor() as cursor_delete_size:
            await cursor_delete_size.execute("SELECT SizeName FROM Size WHERE SizeID = ? AND ProductID = ?", size_id, product_id)
            deleted_size_row = await cursor_delete_size.fetchone()
            if not deleted_size_row:
                 raise HTTPException(status_code=404, detail=f"IMS: Size ID {size_id} not found for product ID {product_id}.")

            await cursor_delete_size.execute("DELETE FROM Size WHERE SizeID = ? AND ProductID = ?", size_id, product_id)
            if cursor_delete_size.rowcount == 0: # Check if delete actually happened
                raise HTTPException(status_code=404, detail=f"IMS: Size ID {size_id} found but not deleted for product ID {product_id}.")
        
        # fetch a representative remaining size for POS sync (if any)
        remaining_representative_size_for_pos: Optional[str] = None
        async with conn.cursor() as cursor_fetch_remaining_sizes:
           await cursor_fetch_remaining_sizes.execute("SELECT TOP 1 SizeName FROM Size WHERE ProductID = ? ORDER BY SizeName", product_id)
           size_row = await cursor_fetch_remaining_sizes.fetchone()
           if size_row:
               remaining_representative_size_for_pos = size_row.SizeName
        
        # resync product state to pos
        if original_product_info_for_pos_sync:
            product_for_pos_update = ProductDataForPOS(
                ProductName=original_product_info_for_pos_sync['ProductName'],
                ProductTypeName=original_product_info_for_pos_sync['ProductTypeName'],
                ProductCategory=original_product_info_for_pos_sync['ProductCategory'],
                ProductDescription=original_product_info_for_pos_sync.get('ProductDescription'),
                ProductPrice=float(original_product_info_for_pos_sync['ProductPrice'] or 0.0),
                ProductImage=_construct_full_http_url_for_pos_sync(original_product_info_for_pos_sync.get('ProductImage')),
                ProductSize=remaining_representative_size_for_pos 
            )
            await _sync_product_to_pos(token, product_for_pos_update, product_id_for_put=product_id)

        return {"message": f"IMS: Size ID {size_id} deleted for product ID {product_id}. Product state (with potentially updated single size) synced to POS."}
    finally:
        if conn: await conn.close()