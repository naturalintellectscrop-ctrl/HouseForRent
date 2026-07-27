'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, Plus, X, Loader2, Image as ImageIcon, CreditCard, Phone, Building, Info, Upload
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAppStore, type Property, type Amenity } from '@/store/useAppStore';
import { toast } from 'sonner';

const propertySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.string().min(1, 'Price is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  location: z.string().optional(),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  propertyType: z.string().min(1, 'Property type is required'),
  area: z.string().min(1, 'Area is required'),
  furnished: z.boolean().default(false),
  parking: z.boolean().default(false),
  petsAllowed: z.boolean().default(false),
  yearBuilt: z.string().optional(),
  floor: z.string().optional(),
  totalFloors: z.string().optional(),
  listingType: z.string().min(1, 'Listing type is required'),
  landTitleType: z.string().optional(),
  paymentReference: z.string().optional(),
});

type PropertyFormData = z.infer<typeof propertySchema>;

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'HOUSE', label: 'House' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'CONDO', label: 'Condominium' },
  { value: 'BUNGALOW', label: 'Bungalow' },
  { value: 'TOWNHOUSE', label: 'Townhouse' },
  { value: 'BEDSITTER', label: 'Bedsitter' },
  { value: 'LAND', label: 'Land' },
];

const LISTING_TYPES = [
  { value: 'RENT', label: 'For Rent' },
  { value: 'SALE', label: 'For Sale' },
  { value: 'BOTH', label: 'Rent & Sale' },
];

const LAND_TITLE_TYPES = [
  { value: 'READY_TITLE', label: 'Ready Land Title' },
  { value: 'AGREEMENT', label: 'Agreement' },
  { value: 'MILE_LAND', label: 'Mile Land' },
  { value: 'CROWN_LAND', label: 'Crown Land' },
];

const MAX_IMAGES = 5;

export default function AddPropertyForm() {
  const { user, setCurrentView, selectedPropertyId, setSelectedPropertyId } = useAppStore();
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      title: '',
      description: '',
      price: '',
      address: '',
      city: '',
      location: '',
      bedrooms: '',
      bathrooms: '',
      propertyType: '',
      area: '',
      furnished: false,
      parking: false,
      petsAllowed: false,
      yearBuilt: '',
      floor: '',
      totalFloors: '',
      listingType: 'RENT',
      landTitleType: '',
      paymentReference: '',
    },
  });

  const furnished = watch('furnished');
  const parking = watch('parking');
  const petsAllowed = watch('petsAllowed');
  const propertyType = watch('propertyType');
  const listingType = watch('listingType');

  const isLand = propertyType === 'LAND';

  // Fetch amenities
  useEffect(() => {
    fetch('/api/amenities')
      .then((res) => res.json())
      .then((data) => setAmenities(data))
      .catch(() => {});
  }, []);

  // Load editing property
  useEffect(() => {
    if (!selectedPropertyId) return;
    fetch(`/api/properties/${selectedPropertyId}`)
      .then((res) => res.json())
      .then((data) => {
        setEditingProperty(data);
        reset({
          title: data.title,
          description: data.description,
          price: String(data.price),
          address: data.address,
          city: data.city,
          location: data.location || '',
          bedrooms: String(data.bedrooms),
          bathrooms: String(data.bathrooms),
          propertyType: data.propertyType,
          area: String(data.area),
          furnished: data.furnished,
          parking: data.parking,
          petsAllowed: data.petsAllowed,
          yearBuilt: data.yearBuilt ? String(data.yearBuilt) : '',
          floor: data.floor ? String(data.floor) : '',
          totalFloors: data.totalFloors ? String(data.totalFloors) : '',
          listingType: data.listingType || 'RENT',
          landTitleType: data.landTitleType || '',
          paymentReference: data.paymentReference || '',
        });
        setImageUrls(data.images?.map((img: any) => img.url) || []);
        setSelectedAmenities(data.amenities?.map((pa: any) => pa.amenityId) || []);
      })
      .catch(() => toast.error('Failed to load property'));
  }, [selectedPropertyId, reset]);

  const addImage = () => {
    if (imageUrls.length >= MAX_IMAGES) {
      toast.error(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }
    if (newImageUrl.trim()) {
      setImageUrls((prev) => [...prev, newImageUrl.trim()]);
      setNewImageUrl('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = MAX_IMAGES - imageUrls.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);
    setUploading(true);

    try {
      for (const file of filesToUpload) {
        // Validate file size
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 5MB)`);
          continue;
        }
        // Validate file type
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          toast.error(`${file.name} is not a supported image format`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setImageUrls((prev) => [...prev, data.url]);
        } else {
          const errorData = await res.json();
          toast.error(errorData.error || `Failed to upload ${file.name}`);
        }
      }
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleAmenity = (amenityId: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenityId)
        ? prev.filter((id) => id !== amenityId)
        : [...prev, amenityId]
    );
  };

  const onSubmit = async (data: PropertyFormData) => {
    if (!user) {
      toast.error('Please login first');
      return;
    }

    // Validate bedrooms/bathrooms for non-LAND types
    if (!isLand) {
      if (!data.bedrooms) {
        toast.error('Bedrooms is required for non-land properties');
        return;
      }
      if (!data.bathrooms) {
        toast.error('Bathrooms is required for non-land properties');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        ...data,
        location: data.location || data.address,
        bedrooms: data.bedrooms || '0',
        bathrooms: data.bathrooms || '0',
        images: imageUrls.map((url, i) => ({ url, isPrimary: i === 0 })),
        amenityIds: selectedAmenities,
      };

      const url = editingProperty
        ? `/api/properties/${editingProperty.id}`
        : '/api/properties';

      const res = await fetch(url, {
        method: editingProperty ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editingProperty ? 'Property updated!' : 'Property created! It will be reviewed before going live.');
        setSelectedPropertyId(null);
        setCurrentView('my-listings');
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to save property');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // Group amenities by category
  const amenityCategories = amenities.reduce((acc, amenity) => {
    const category = amenity.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(amenity);
    return acc;
  }, {} as Record<string, Amenity[]>);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-3xl px-4 py-8 sm:px-6"
    >
      <Button variant="ghost" onClick={() => { setSelectedPropertyId(null); setCurrentView('my-listings'); }} className="mb-4 gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Button>

      <h1 className="text-2xl font-bold sm:text-3xl mb-8">
        {editingProperty ? 'Edit Property' : 'Add New Property'}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" placeholder="e.g., Modern 2BR Apartment in Kololo" {...register('title')} />
              {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea id="description" placeholder="Describe your property..." className="min-h-[120px]" {...register('description')} />
              {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="propertyType">Property Type *</Label>
                <Select value={propertyType} onValueChange={(v) => setValue('propertyType', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.propertyType && <p className="text-xs text-red-500">{errors.propertyType.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="listingType">Listing Type *</Label>
                <Select value={listingType} onValueChange={(v) => setValue('listingType', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select listing type" />
                  </SelectTrigger>
                  <SelectContent>
                    {LISTING_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.listingType && <p className="text-xs text-red-500">{errors.listingType.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">
                Price (UGX{listingType === 'RENT' ? '/month' : listingType === 'SALE' ? ' - Sale Price' : ' - Rent/Sale Price'}) *
              </Label>
              <Input id="price" type="number" placeholder="e.g., 250000" {...register('price')} />
              {errors.price && <p className="text-xs text-red-500">{errors.price.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input id="city" placeholder="e.g., Kampala" {...register('city')} />
                {errors.city && <p className="text-xs text-red-500">{errors.city.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <Input id="address" placeholder="e.g., Kololo Hill" {...register('address')} />
                {errors.address && <p className="text-xs text-red-500">{errors.address.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location / Area</Label>
              <Input id="location" placeholder="e.g., Near Yaya Centre" {...register('location')} />
            </div>
          </CardContent>
        </Card>

        {/* Property Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bedrooms">
                  Bedrooms {isLand ? '' : '*'}
                </Label>
                <Input
                  id="bedrooms"
                  type="number"
                  placeholder={isLand ? 'N/A' : 'e.g., 2'}
                  {...register('bedrooms')}
                  disabled={isLand}
                />
                {!isLand && errors.bedrooms && <p className="text-xs text-red-500">{errors.bedrooms.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="bathrooms">
                  Bathrooms {isLand ? '' : '*'}
                </Label>
                <Input
                  id="bathrooms"
                  type="number"
                  placeholder={isLand ? 'N/A' : 'e.g., 1'}
                  {...register('bathrooms')}
                  disabled={isLand}
                />
                {!isLand && errors.bathrooms && <p className="text-xs text-red-500">{errors.bathrooms.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">Area (sqm) *</Label>
                <Input id="area" type="number" placeholder="e.g., 800" {...register('area')} />
                {errors.area && <p className="text-xs text-red-500">{errors.area.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="yearBuilt">Year Built</Label>
                <Input id="yearBuilt" type="number" placeholder="e.g., 2020" {...register('yearBuilt')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="floor">Floor</Label>
                <Input id="floor" type="number" placeholder="e.g., 3" {...register('floor')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalFloors">Total Floors</Label>
                <Input id="totalFloors" type="number" placeholder="e.g., 10" {...register('totalFloors')} />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="furnished" className="cursor-pointer">Furnished</Label>
                <Switch id="furnished" checked={furnished} onCheckedChange={(v) => setValue('furnished', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="parking" className="cursor-pointer">Parking Available</Label>
                <Switch id="parking" checked={parking} onCheckedChange={(v) => setValue('parking', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="petsAllowed" className="cursor-pointer">Pets Allowed</Label>
                <Switch id="petsAllowed" checked={petsAllowed} onCheckedChange={(v) => setValue('petsAllowed', v)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Land Title Information */}
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-base">Land Title Information</CardTitle>
            </div>
            <CardDescription>
              Important for property verification. Buyers and renters value properties with clear title documentation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="landTitleType">Land Title Type</Label>
              <Select value={watch('landTitleType') || ''} onValueChange={(v) => setValue('landTitleType', v === 'NONE' ? '' : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select land title type (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {LAND_TITLE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Images</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {imageUrls.length}/{MAX_IMAGES} images added
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {imageUrls.length < MAX_IMAGES && (
              <div className="space-y-3">
                {/* File Upload Area */}
                <div className="relative">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="image-upload"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="image-upload"
                    className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                      uploading
                        ? 'border-red-300 bg-red-50/50 dark:border-red-700 dark:bg-red-950/20'
                        : 'border-muted-foreground/25 hover:border-red-400 hover:bg-red-50/50 dark:hover:border-red-600 dark:hover:bg-red-950/20'
                    }`}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-8 w-8 text-red-500 animate-spin mb-2" />
                        <p className="text-sm font-medium text-red-600">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Click to upload images</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          JPEG, PNG, WebP, GIF &bull; Max 5MB each &bull; {MAX_IMAGES - imageUrls.length} remaining
                        </p>
                      </>
                    )}
                  </label>
                </div>

                {/* Or enter URL manually */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Or paste image URL..."
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImage())}
                  />
                  <Button type="button" variant="outline" onClick={addImage}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            {imageUrls.length > 0 && (
              <div className="space-y-2">
                {imageUrls.map((url, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                    <div className="h-10 w-14 shrink-0 rounded bg-muted overflow-hidden">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </div>
                    <span className="text-sm text-muted-foreground truncate flex-1">{url}</span>
                    {i === 0 && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeImage(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {imageUrls.length >= MAX_IMAGES && (
              <p className="text-xs text-muted-foreground text-center">
                Maximum {MAX_IMAGES} images reached. Remove an image to add a new one.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Amenities */}
        {Object.keys(amenityCategories).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Amenities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(amenityCategories).map(([category, items]) => (
                <div key={category}>
                  <p className="text-sm font-medium text-muted-foreground mb-2">{category}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((amenity) => (
                      <label key={amenity.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedAmenities.includes(amenity.id)}
                          onCheckedChange={() => toggleAmenity(amenity.id)}
                        />
                        {amenity.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Payment Information */}
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              <CardTitle className="text-base">Payment Information</CardTitle>
            </div>
            <CardDescription>
              Listing fee: UGX 10,000 per property. Pay to activate your listing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Payment Methods */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Payment Methods:</p>
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                    <Phone className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">MTN Mobile Money</p>
                    <p className="text-xs text-muted-foreground">+256785710818</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                    <Phone className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Airtel Mobile Money</p>
                    <p className="text-xs text-muted-foreground">+256752255676</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
                    <Building className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Bank Account</p>
                    <p className="text-xs text-muted-foreground">Will be provided upon request</p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Payment Reference */}
            <div className="space-y-2">
              <Label htmlFor="paymentReference">Payment Reference</Label>
              <Input
                id="paymentReference"
                placeholder="Enter your payment transaction ID/reference"
                {...register('paymentReference')}
              />
              <p className="text-xs text-muted-foreground">
                After payment, your property will be reviewed by our admin team before going live.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center gap-4">
          <Button
            type="submit"
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {editingProperty ? 'Update Property' : 'Create Property'}
          </Button>
          <Button type="button" variant="outline" onClick={() => { setSelectedPropertyId(null); setCurrentView('my-listings'); }}>
            Cancel
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
