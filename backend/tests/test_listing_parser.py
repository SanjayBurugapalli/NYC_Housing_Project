"""Unit tests for the StreetEasy / Zillow listing-URL parser (no network, no DB)."""

import pytest

from app.services.listing_parser import parse_listing_url, zip_to_borough


@pytest.mark.parametrize(
    "url, house, street, borough, locality",
    [
        # StreetEasy, Manhattan, with a unit and a query string
        ("https://streeteasy.com/building/345-east-56-street-new_york/12a?featured=1",
         "345", "East 56 Street", "MANHATTAN", None),
        # No scheme, Brooklyn
        ("streeteasy.com/building/3165-nostrand-avenue-brooklyn",
         "3165", "Nostrand Avenue", "BROOKLYN", None),
        # Trailing slash, www host, Bronx
        ("https://www.streeteasy.com/building/2400-grand-concourse-bronx/",
         "2400", "Grand Concourse", "BRONX", None),
        # Staten Island (underscore area)
        ("http://streeteasy.com/building/50-bay-street-staten_island",
         "50", "Bay Street", "STATEN ISLAND", None),
        # Queens: neighborhood area + underscore-hyphenated house number
        ("https://streeteasy.com/building/31_10-30-avenue-astoria/3f",
         "31-10", "30 Avenue", None, "Astoria"),
        # Queens: multi-word neighborhood slug
        ("https://streeteasy.com/building/27_28-thomson-avenue-long_island_city",
         "27-28", "Thomson Avenue", None, "Long Island City"),
        # Zillow homedetails with an APT unit and Manhattan zip
        ("https://www.zillow.com/homedetails/123-W-45th-St-APT-5B-New-York-NY-10036/2077123456_zpid/",
         "123", "W 45th St", "MANHATTAN", None),
        # Zillow Queens: hyphenated house number split across tokens
        ("https://www.zillow.com/homedetails/21-15-34th-Ave-APT-5B-Astoria-NY-11106/2077123456_zpid/",
         "21-15", "34th Ave", "QUEENS", "Astoria"),
        # Zillow building page (no zip; borough from the city name)
        ("https://www.zillow.com/b/113-e-36th-st-new-york-ny-5Xs7bV/",
         "113", "E 36th St", "MANHATTAN", None),
        # Zillow Brooklyn, UNIT designator, no www
        ("zillow.com/homedetails/80-Bergen-St-UNIT-2-Brooklyn-NY-11201/99_zpid",
         "80", "Bergen St", "BROOKLYN", None),
        # Zillow address-search URL
        ("https://www.zillow.com/homes/450-Grand-St-Brooklyn,-NY-11211_rb/",
         "450", "Grand St", "BROOKLYN", None),
        # Zillow with a query string and the Bronx
        ("https://www.zillow.com/homedetails/2100-Bronx-Park-E-Bronx-NY-10462/1_zpid/?view=public",
         "2100", "Bronx Park E", "BRONX", None),
    ],
)
def test_parses_address_urls(url, house, street, borough, locality):
    parsed = parse_listing_url(url)
    assert parsed.status == "ok"
    assert parsed.house_number == house
    assert parsed.street == street
    assert parsed.borough == borough
    assert parsed.locality == locality


@pytest.mark.parametrize(
    "url",
    [
        "https://streeteasy.com/rental/4512345",
        "https://streeteasy.com/sale/1234567",
        "https://streeteasy.com/building/the-eugene",
        "https://streeteasy.com/building/the-eugene/52b",
        "https://www.zillow.com/apartments/new-york-ny/the-xyz/5XjKkL/",
        "https://www.zillow.com/b/the-max-new-york-ny-5Xs7bV/",
    ],
)
def test_links_without_an_address(url):
    assert parse_listing_url(url).status == "no_address"


@pytest.mark.parametrize(
    "url",
    [
        "",
        "not a url",
        "https://example.com/building/345-east-56-street-new_york",
        "https://streeteasy.com/for-rent/nyc",
        "https://www.zillow.com/homes/for_rent/",
    ],
)
def test_invalid_links(url):
    assert parse_listing_url(url).status == "invalid"


def test_new_jersey_listings_are_out_of_area():
    assert parse_listing_url("https://streeteasy.com/building/77-hudson-street-jersey_city").status == "out_of_area"
    assert parse_listing_url(
        "https://www.zillow.com/homedetails/77-Hudson-St-Jersey-City-NJ-07302/1_zpid/"
    ).status == "out_of_area"


def test_display_and_geocode_text():
    se = parse_listing_url("https://streeteasy.com/building/345-east-56-street-new_york")
    assert se.display_address == "345 East 56 Street, Manhattan"
    assert se.geocode_text == "345 East 56 Street, Manhattan"

    queens = parse_listing_url("https://streeteasy.com/building/31_10-30-avenue-astoria")
    assert queens.display_address == "31-10 30 Avenue, Astoria"
    assert queens.geocode_text == "31-10 30 Avenue, Astoria"

    zillow = parse_listing_url("https://www.zillow.com/homedetails/80-Bergen-St-Brooklyn-NY-11201/1_zpid/")
    assert zillow.geocode_text == "80 Bergen St, Brooklyn, NY 11201"


@pytest.mark.parametrize(
    "zip_code, borough",
    [("10036", "MANHATTAN"), ("10462", "BRONX"), ("11211", "BROOKLYN"), ("11106", "QUEENS"),
     ("11692", "QUEENS"), ("10314", "STATEN ISLAND"), ("07302", None), ("11501", None), (None, None)],
)
def test_zip_to_borough(zip_code, borough):
    assert zip_to_borough(zip_code) == borough
