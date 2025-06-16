from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import List
from datetime import date
import httpx
from database import get_db_connection

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="http://localhost:4000/auth/token")
router = APIRouter(prefix="/ingredients", tags=["ingredients"])

# threshold for stock status
thresholds = {
    "g": 50,
    "kg": 0.5,
    "ml": 100,
    "l": 0.5,
}

def get_status(amount: float, measurement: str):
    if amount <= 0:
        return "Not Available"
    elif amount <= thresholds.get(measurement, 1):
        return "Low Stock"
    return "Available"

# models
class IngredientCreate(BaseModel):
    IngredientName: str
    Amount: float
    Measurement: str
    BestBeforeDate: date
    ExpirationDate: date

class IngredientUpdate(BaseModel):
    IngredientName: str
    Amount: float
    Measurement: str
    BestBeforeDate: date
    ExpirationDate: date

class IngredientOut(BaseModel):
    IngredientID: int
    IngredientName: str
    Amount: float
    Measurement: str
    BestBeforeDate: date
    ExpirationDate: date
    Status: str

# auth validation
async def validate_token_and_roles(token: str, allowed_roles: List[str], allowed_systems: List[str] = ["IMS"]):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:4000/auth/users/me",
            headers={"Authorization": f"Bearer {token}"}
        )

    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_data = response.json()
    user_role = user_data.get("userRole")
    user_system = user_data.get("system")
    if user_role not in allowed_roles or user_system not in allowed_systems:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")


# get all ingredients
@router.get("/", response_model=List[IngredientOut])
async def get_all_ingredients(token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])

    conn = await get_db_connection()
    async with conn.cursor() as cursor:
        await cursor.execute("SELECT * FROM Ingredients")
        rows = await cursor.fetchall()
        return [
            {
                "IngredientID": row.IngredientID,
                "IngredientName": row.IngredientName,
                "Amount": row.Amount,
                "Measurement": row.Measurement,
                "BestBeforeDate": row.BestBeforeDate,
                "ExpirationDate": row.ExpirationDate,
                "Status": row.Status
            }
            for row in rows
        ]

# create ingredients
@router.post("/", response_model=IngredientOut)
async def add_ingredient(ingredient: IngredientCreate, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])

    conn = await get_db_connection()
    async with conn.cursor() as cursor:

         # duplicate check
        await cursor.execute("""
            SELECT 1 FROM Ingredients
            WHERE IngredientName COLLATE Latin1_General_CI_AS = ?
        """, ingredient.IngredientName)
        if await cursor.fetchone():
            raise HTTPException(status_code=400, detail="Ingredient name already exists.")

        status = get_status(ingredient.Amount, ingredient.Measurement)
        await cursor.execute("""
            INSERT INTO Ingredients (IngredientName, Amount, Measurement, BestBeforeDate, ExpirationDate, Status)
            OUTPUT INSERTED.*
            VALUES (?, ?, ?, ?, ?, ?)
        """, ingredient.IngredientName, ingredient.Amount, ingredient.Measurement,
             ingredient.BestBeforeDate, ingredient.ExpirationDate, status)
        row = await cursor.fetchone()
        return {
            "IngredientID": row.IngredientID,
            "IngredientName": row.IngredientName,
            "Amount": row.Amount,
            "Measurement": row.Measurement,
            "BestBeforeDate": row.BestBeforeDate,
            "ExpirationDate": row.ExpirationDate,
            "Status": row.Status
        }

# update ingredients
@router.put("/{ingredient_id}", response_model=IngredientOut)
async def update_ingredient(ingredient_id: int, ingredient: IngredientUpdate, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])

    conn = await get_db_connection()
    async with conn.cursor() as cursor:

         # duplicate check
        await cursor.execute("""
            SELECT 1 FROM Ingredients
            WHERE IngredientName COLLATE Latin1_General_CI_AS = ?
              AND IngredientID != ?
        """, ingredient.IngredientName, ingredient_id)
        if await cursor.fetchone():
            raise HTTPException(status_code=400, detail="Ingredient name already exists.")
        
        status = get_status(ingredient.Amount, ingredient.Measurement)
        await cursor.execute("""
            UPDATE Ingredients
            SET IngredientName = ?, Amount = ?, Measurement = ?, BestBeforeDate = ?, ExpirationDate = ?, Status = ?
            WHERE IngredientID = ?
        """, ingredient.IngredientName, ingredient.Amount, ingredient.Measurement,
             ingredient.BestBeforeDate, ingredient.ExpirationDate, status, ingredient_id)

        await cursor.execute("SELECT * FROM Ingredients WHERE IngredientID = ?", ingredient_id)
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Ingredient not found")

        return {
            "IngredientID": row.IngredientID,
            "IngredientName": row.IngredientName,
            "Amount": row.Amount,
            "Measurement": row.Measurement,
            "BestBeforeDate": row.BestBeforeDate,
            "ExpirationDate": row.ExpirationDate,
            "Status": row.Status
        }

# delete ingredients
@router.delete("/{ingredient_id}")
async def delete_ingredient(ingredient_id: int, token: str = Depends(oauth2_scheme)):
    await validate_token_and_roles(token, ["admin", "manager", "staff"])

    conn = await get_db_connection()
    async with conn.cursor() as cursor:
        await cursor.execute("DELETE FROM Ingredients WHERE IngredientID = ?", ingredient_id)

    return {"message": "Ingredient deleted successfully"}
